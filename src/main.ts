import 'reflect-metadata';
import express from 'express';
import OpenApiValidator from 'express-openapi-validator';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { fileURLToPath } from 'node:url';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.schema.js';
import { problemHandler } from './middleware/problem-handler.js';
import ordersRouter from './routes/orders.js';
import productsRouter from './routes/products.js';

const apiSpec = fileURLToPath(new URL('../openapi/openapi.yaml', import.meta.url));

const app = await NestFactory.create<NestExpressApplication>(AppModule, {
  bodyParser: false,
});

app.use(express.json());

app.use(
  OpenApiValidator.middleware({
    apiSpec,
    validateRequests: true,
    validateResponses: true,
    ignoreUndocumented: true,
  }),
);

app.use('/products', productsRouter);
app.use('/orders', ordersRouter);
app.use(problemHandler);

app.enableShutdownHooks();

const config = app.get(ConfigService<Env, true>);
const port = config.get('PORT', { infer: true });

await app.listen(port);

console.log(`Marketplace API is listening on http://localhost:${port}`);
