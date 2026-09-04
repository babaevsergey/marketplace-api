import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.schema.js';

const app = await NestFactory.create(AppModule);

app.enableShutdownHooks();

const config = app.get(ConfigService<Env, true>);
const port = config.get('PORT', { infer: true });

await app.listen(port);

console.log(`Marketplace API is listening on http://localhost:${port}`);
