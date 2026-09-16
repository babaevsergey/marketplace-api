import { Router } from 'express';

const router = Router();

const products = [
  {
    id: 'product_1',
    name: 'Mechanical Keyboard',
    description: 'RGB mechanical keyboard',
    price_cents: 19999,
    available: true,
  },
  {
    id: 'product_2',
    name: 'Automative Keyboard',
    description: 'RGB automative keyboard',
    price_cents: 29999,
    available: true,
  },
  {
    id: 'product_3',
    name: 'Simple Keyboard',
    description: 'RGB  keyboard',
    price_cents: 39999,
    available: true,
  },
  {
    id: 'product_4',
    name: 'Laptop Keyboard',
    description: 'Mechanical keyboard',
    price_cents: 49999,
    available: false,
  },
];

const encodeCursor = (productId) => Buffer.from(productId, 'utf8').toString('base64url');

const decodeCursor = (cursor) => Buffer.from(cursor, 'base64url').toString('utf8');

router.get('/', (req, res) => {
  const limit = Number(req.query.limit ?? 20);
  let startIndex = 0;

  if (req.query.cursor) {
    const productId = decodeCursor(req.query.cursor);
    const productIndex = products.findIndex((product) => product.id === productId);

    if (productIndex === -1) {
      const error = new Error('Unknown cursor');
      error.status = 400;
      throw error;
    }

    startIndex = productIndex + 1;
  }

  const items = products.slice(startIndex, startIndex + limit);
  const hasMoreProducts = startIndex + items.length < products.length;
  const nextCursor = hasMoreProducts ? encodeCursor(items.at(-1).id) : null;

  res.json({
    items,
    next_cursor: nextCursor,
  });
});

export default router;
