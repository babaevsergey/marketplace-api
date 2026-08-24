import { Router } from 'express';

const router = Router();

const orders = [];
const idempotencyRecords = new Map();

const productPrices = new Map([
  ['product_1', 19999],
  ['product_2', 29999],
  ['product_3', 39999],
  ['product_4', 49999],
]);

const encodeCursor = (orderId) => Buffer.from(orderId, 'utf8').toString('base64url');

const decodeCursor = (cursor) => Buffer.from(cursor, 'base64url').toString('utf8');

const createHttpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

router.get('/', (req, res) => {
  const limit = Number(req.query.limit ?? 20);
  let startIndex = 0;

  if (req.query.cursor) {
    const orderId = decodeCursor(req.query.cursor);
    const orderIndex = orders.findIndex((order) => order.id === orderId);

    if (orderIndex === -1) {
      throw createHttpError(400, 'Unknown cursor');
    }

    startIndex = orderIndex + 1;
  }

  const items = orders.slice(startIndex, startIndex + limit);
  const hasMoreOrders = startIndex + items.length < orders.length;
  const nextCursor = hasMoreOrders ? encodeCursor(items.at(-1).id) : null;

  res.json({
    items,
    next_cursor: nextCursor,
  });
});

router.post('/', (req, res) => {
  const idempotencyKey = req.get('Idempotency-Key');
  const requestFingerprint = JSON.stringify(
    req.body.items.map(({ product_id, quantity }) => [product_id, quantity]),
  );
  const existingRecord = idempotencyRecords.get(idempotencyKey);

  if (existingRecord) {
    if (existingRecord.requestFingerprint !== requestFingerprint) {
      throw createHttpError(422, 'Idempotency key was already used for another order');
    }

    return res.set('Idempotency-Replay', 'true').status(201).json(existingRecord.order);
  }

  const orderLines = req.body.items.map((item) => {
    const unitPriceCents = productPrices.get(item.product_id);

    if (unitPriceCents === undefined) {
      throw createHttpError(400, `Unknown product: ${item.product_id}`);
    }

    return {
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price_cents: unitPriceCents,
      line_total_cents: unitPriceCents * item.quantity,
    };
  });

  const totalCents = orderLines.reduce((total, item) => total + item.line_total_cents, 0);
  const order = {
    id: `order_${orders.length + 1}`,
    items: orderLines,
    total_cents: totalCents,
    status: 'created',
    created_at: new Date().toISOString(),
  };

  orders.push(order);
  idempotencyRecords.set(idempotencyKey, {
    requestFingerprint,
    order,
  });

  return res.status(201).json(order);
});

router.get('/:orderId', (req, res) => {
  const order = orders.find((item) => item.id === req.params.orderId);

  if (!order) {
    throw createHttpError(404, `Order not found: ${req.params.orderId}`);
  }

  res.json(order);
});

export default router;
