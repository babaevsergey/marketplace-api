import { deepStrictEqual, strictEqual } from 'node:assert';
import type { Logger } from 'typeorm';
import dataSource from './data-source.js';
import { Order } from './entities/order.entity.js';
import { OrderItem } from './entities/order-item.entity.js';
import { Product } from './entities/product.entity.js';

// Count actual SQL queries; print their text only when explicitly requested.
class QueryCounter implements Logger {
  count = 0;

  logQuery(query: string): void {
    this.count += 1;
    if (process.env.SHOW_SQL === '1') {
      console.log(`[SQL ${this.count}] ${query}`);
    }
  }

  logQueryError(error: string | Error): void {
    console.error(error);
  }

  logQuerySlow(): void {}
  logSchemaBuild(): void {}
  logMigration(): void {}
  log(): void {}
}

async function main(): Promise<void> {
  const logger = new QueryCounter();
  dataSource.setOptions({ logging: ['query'], logger });

  await dataSource.initialize();

  try {
    const ordersRepository = dataSource.getRepository(Order);
    const itemsRepository = dataSource.getRepository(OrderItem);
    const productsRepository = dataSource.getRepository(Product);

    const results: { orders: number; before: number; after: number }[] = [];

    for (const size of [5, 10]) {
      // Exclude connection initialization and previous runs from the comparison.
      logger.count = 0;
      console.log(`\n--- ${size} orders: before ---`);
      const orders = await ordersRepository.find({
        order: { id: 'ASC' },
        take: size,
      });
      strictEqual(orders.length, size, 'Run the seed first: this demo needs at least 10 orders.');

      for (const order of orders) {
        order.items = await itemsRepository.findBy({
          orderId: order.id,
        });

        for (const item of order.items) {
          item.product = await productsRepository.findOneByOrFail({
            id: item.productId,
          });
        }
      }

      const beforeCount = logger.count;
      console.log(`SQL queries: ${beforeCount}`);

      console.log(`--- ${size} orders: after ---`);
      logger.count = 0;

      // Limit orders inside the same SQL query, not the joined item rows.
      // A subquery is part of this one query, not a separate database request.
      const ordersWithProducts = await ordersRepository
        .createQueryBuilder('order')
        .where((qb) => {
          const selectedOrders = qb
            .subQuery()
            .select('selected.id')
            .from(Order, 'selected')
            .orderBy('selected.id', 'ASC')
            .limit(size)
            .getQuery();
          return `order.id IN ${selectedOrders}`;
        })
        .leftJoinAndSelect('order.items', 'item')
        .leftJoinAndSelect('item.product', 'product')
        .orderBy('order.id', 'ASC')
        .getMany();

      const afterCount = logger.count;
      // Item order is not guaranteed by SQL; normalize it before comparing.
      for (const order of [...orders, ...ordersWithProducts]) {
        order.items.sort((a, b) => a.id.localeCompare(b.id));
      }
      deepStrictEqual(ordersWithProducts, orders, 'Both approaches must load the same data.');
      strictEqual(afterCount, 1, 'The JOIN version must execute exactly one SQL query.');
      console.log(`SQL queries: ${afterCount} | Same data: yes`);
      results.push({ orders: size, before: beforeCount, after: afterCount });
    }

    console.log('\n--- Summary: actual SQL query counts ---');
    console.table(results);
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
