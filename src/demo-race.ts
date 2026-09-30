import { strictEqual } from 'node:assert';
import { CheckoutRejectedError, checkout } from './checkout.js';
import dataSource from './data-source.js';

const ATTEMPTS = 50;
const INITIAL_STOCK = 10;
const INITIAL_BALANCE_CENTS = 1_000_000;

type IdRow = { id: string };
type StockRow = { stock: number };
type CountRow = { count: string };

async function main(): Promise<void> {
  await dataSource.initialize();

  try {
    const buyers = await dataSource.query<IdRow[]>(`SELECT id FROM users WHERE email = $1`, [
      'seed-user-1@example.com',
    ]);
    const products = await dataSource.query<IdRow[]>(`SELECT id FROM products WHERE name = $1`, [
      'Seed Product 1',
    ]);

    const buyer = buyers[0];
    const product = products[0];

    if (!buyer || !product) {
      throw new Error('Run the seed before demo:race');
    }

    // Reset only the dedicated seed records used by this repeatable demo.
    await dataSource.query(`UPDATE users SET balance_cents = $1 WHERE id = $2`, [
      INITIAL_BALANCE_CENTS,
      buyer.id,
    ]);
    await dataSource.query(`UPDATE products SET stock = $1 WHERE id = $2`, [
      INITIAL_STOCK,
      product.id,
    ]);

    const results = await Promise.allSettled(
      Array.from({ length: ATTEMPTS }, () =>
        checkout({
          userId: buyer.id,
          productId: product.id,
          quantity: 1,
        }),
      ),
    );

    const successful = results.filter((result) => result.status === 'fulfilled').length;
    const expectedRejections = results.filter(
      (result) =>
        result.status === 'rejected' &&
        result.reason instanceof CheckoutRejectedError &&
        result.reason.code === 'INSUFFICIENT_STOCK',
    ).length;
    const unexpectedErrors = results.filter(
      (result) => result.status === 'rejected' && !(result.reason instanceof CheckoutRejectedError),
    );

    if (unexpectedErrors.length > 0) {
      throw new AggregateError(
        unexpectedErrors.map((result) =>
          result.status === 'rejected' ? result.reason : undefined,
        ),
        'Unexpected checkout errors',
      );
    }

    const stocks = await dataSource.query<StockRow[]>(`SELECT stock FROM products WHERE id = $1`, [
      product.id,
    ]);
    const negativeCounts = await dataSource.query<CountRow[]>(
      `SELECT COUNT(*) AS count FROM products WHERE stock < 0`,
    );

    const finalStock = stocks[0]?.stock;
    const negativeStockRows = Number(negativeCounts[0]?.count ?? 0);

    console.log(`Attempts: ${ATTEMPTS}`);
    console.log(`Successful: ${successful}`);
    console.log(`Rejected: ${expectedRejections}`);
    console.log(`Final stock: ${finalStock}`);
    console.log(`Negative stock rows: ${negativeStockRows}`);

    strictEqual(successful, INITIAL_STOCK, 'Successful checkouts must equal initial stock');
    strictEqual(
      expectedRejections,
      ATTEMPTS - INITIAL_STOCK,
      'All remaining attempts must be rejected because stock is exhausted',
    );
    strictEqual(finalStock, 0, 'Final stock must be zero');
    strictEqual(negativeStockRows, 0, 'Stock must never become negative');

    console.log('Invariant: OK');
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
