import 'reflect-metadata';
import { fileURLToPath } from 'node:url';
import { DataSource } from 'typeorm';
import { z } from 'zod';

import { User } from './entities/user.entity.js';
import { Product } from './entities/product.entity.js';
import { Order } from './entities/order.entity.js';
import { OrderItem } from './entities/order-item.entity.js';

const config = z
  .object({
    DB_HOST: z.string().min(1),
    DB_PORT: z.coerce.number().int().min(1).max(65535),
    DB_USER: z.string().min(1),
    DB_PASSWORD: z.string().min(1),
    DB_NAME: z.string().min(1),
  })
  .parse(process.env);

export default new DataSource({
  type: 'postgres',

  host: config.DB_HOST,
  port: config.DB_PORT,
  username: config.DB_USER,
  password: config.DB_PASSWORD,
  database: config.DB_NAME,

  entities: [User, Product, Order, OrderItem],

  migrations: [fileURLToPath(new URL('./migrations/*.js', import.meta.url))],

  synchronize: false,
});
