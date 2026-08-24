import express from 'express';
import OpenApiValidator from 'express-openapi-validator';
import productsRouter from './routes/products.js';
import { fileURLToPath } from 'node:url';
import { problemHandler } from './middleware/problem-handler.js';
import ordersRouter from './routes/orders.js';

const apiSpec = fileURLToPath(new URL('../openapi/openapi.yaml', import.meta.url));

const app = express();

app.use(express.json());

app.use(
  OpenApiValidator.middleware({
    apiSpec,
    validateRequests: true,
    validateResponses: true,
  }),
);

app.use('/products', productsRouter);
app.use('/orders', ordersRouter);

app.use(problemHandler);

app.listen(3000, () => {
  console.log('Marketplace API is listening on http://localhost:3000');
});
