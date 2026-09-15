import dataSource from './data-source.js';
import { User } from './entities/user.entity.js';
import { Product } from './entities/product.entity.js';
import { Order } from './entities/order.entity.js';
import { OrderItem } from './entities/order-item.entity.js';

async function seed(): Promise<void> {
  await dataSource.initialize();

  try {
    const usersRepository = dataSource.getRepository(User);

    const users = Array.from({ length: 10 }, (_, index) => ({
      email: `seed-user-${index + 1}@example.com`,
      name: `Seed User ${index + 1}`,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    }));

    await usersRepository.upsert(users, {
      conflictPaths: ['email'],
      skipUpdateIfNoValuesChanged: true,
    });
    console.log(`Users in database: ${await usersRepository.count()}`);

    const productsRepository = dataSource.getRepository(Product);

    const owner = await usersRepository.findOneByOrFail({
      email: 'seed-user-1@example.com',
    });

    for (let number = 1; number <= 10; number += 1) {
      const name = `Seed Product ${number}`;

      const existingProduct = await productsRepository.findOneBy({
        ownerId: owner.id,
        name,
      });

      const product = productsRepository.create({
        id: existingProduct?.id,
        ownerId: owner.id,
        name,
        description: `Description for seed product ${number}`,
        priceCents: number * 1000,
        available: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      await productsRepository.save(product);
    }

    console.log(`Products in database: ${await productsRepository.count()}`);

    const ordersRepository = dataSource.getRepository(Order);
    const orderItemsRepository = dataSource.getRepository(OrderItem);

    for (let number = 1; number <= 10; number += 1) {
      const buyer = await usersRepository.findOneByOrFail({
        email: `seed-user-${number}@example.com`,
      });

      const product = await productsRepository.findOneByOrFail({
        ownerId: owner.id,
        name: `Seed Product ${number}`,
      });

      const createdAt = new Date(Date.UTC(2026, 0, number));
      const quantity = 2;

      const existingOrder = await ordersRepository.findOneBy({
        userId: buyer.id,
        createdAt,
      });

      const order = ordersRepository.create({
        id: existingOrder?.id,
        userId: buyer.id,
        status: number <= 7 ? 'paid' : 'created',
        totalCents: quantity * product.priceCents,
        createdAt,
      });

      const savedOrder = await ordersRepository.save(order);

      await orderItemsRepository.upsert(
        {
          orderId: savedOrder.id,
          productId: product.id,
          quantity,
          unitPriceCents: product.priceCents,
        },
        {
          conflictPaths: ['orderId', 'productId'],
          skipUpdateIfNoValuesChanged: true,
        },
      );
    }

    console.log(`Orders in database: ${await ordersRepository.count()}`);
    console.log(`Order items in database: ${await orderItemsRepository.count()}`);
  } finally {
    await dataSource.destroy();
  }
}

seed().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
