import dataSource from './data-source.js';

export type CheckoutInput = {
  userId: string;
  productId: string;
  quantity: number;
};

export type CheckoutResult = {
  orderId: string;
  totalCents: number;
  remainingStock: number;
  remainingBalanceCents: number;
};

export class CheckoutRejectedError extends Error {
  constructor(
    public readonly code: 'INSUFFICIENT_STOCK' | 'INSUFFICIENT_BALANCE',
    message: string,
  ) {
    super(message);
    this.name = 'CheckoutRejectedError';
  }
}

type ProductRow = {
  id: string;
  price_cents: number;
  stock: number;
};

type UserRow = {
  id: string;
  balance_cents: number;
};

type OrderRow = {
  id: string;
};

type MutationResult<Row> = [rows: Row[], affectedCount: number];

export async function checkout(input: CheckoutInput): Promise<CheckoutResult> {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new TypeError('Quantity must be a positive integer');
  }

  return dataSource.transaction(async (manager) => {
    // Check and decrement stock as one atomic database operation.
    const [products] = await manager.query<MutationResult<ProductRow>>(
      `
        UPDATE products
        SET stock = stock - $1
        WHERE id = $2
          AND stock >= $1
        RETURNING id, price_cents, stock
      `,
      [input.quantity, input.productId],
    );

    const product = products[0];

    if (!product) {
      throw new CheckoutRejectedError(
        'INSUFFICIENT_STOCK',
        'Product does not exist or has insufficient stock',
      );
    }

    const totalCents = product.price_cents * input.quantity;

    // Check and decrement balance as one atomic database operation.
    const [users] = await manager.query<MutationResult<UserRow>>(
      `
        UPDATE users
        SET balance_cents = balance_cents - $1
        WHERE id = $2
          AND balance_cents >= $1
        RETURNING id, balance_cents
      `,
      [totalCents, input.userId],
    );

    const user = users[0];

    if (!user) {
      throw new CheckoutRejectedError(
        'INSUFFICIENT_BALANCE',
        'User does not exist or has insufficient balance',
      );
    }

    const orders = await manager.query<OrderRow[]>(
      `
        INSERT INTO orders (user_id, status, total_cents)
        VALUES ($1, 'paid', $2)
        RETURNING id
      `,
      [input.userId, totalCents],
    );

    const order = orders[0];

    await manager.query(
      `
        INSERT INTO order_items (
          order_id,
          product_id,
          quantity,
          unit_price_cents
        )
        VALUES ($1, $2, $3, $4)
      `,
      [order.id, input.productId, input.quantity, product.price_cents],
    );

    await manager.query(
      `
        INSERT INTO checkout_jobs (order_id, payload)
        VALUES ($1, $2::jsonb)
      `,
      [
        order.id,
        JSON.stringify({
          orderId: order.id,
          userId: input.userId,
          type: 'send_receipt',
        }),
      ],
    );

    return {
      orderId: order.id,
      totalCents,
      remainingStock: product.stock,
      remainingBalanceCents: user.balance_cents,
    };
  });
}
