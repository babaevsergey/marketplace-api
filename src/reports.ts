import dataSource from './data-source.js';
import { Order } from './entities/order.entity.js';

async function main(): Promise<void> {
  await dataSource.initialize();

  try {
    const report = await dataSource
      .getRepository(Order)
      .createQueryBuilder('order')
      .innerJoin('order.user', 'user')
      .select('user.id', 'user_id')
      .addSelect('user.name', 'user_name')
      .addSelect('COUNT(order.id)', 'orders_count')
      .addSelect('SUM(order.totalCents)', 'total_spent_cents')
      .where('order.status = :status', { status: 'paid' })
      .groupBy('user.id')
      .addGroupBy('user.name')
      .orderBy('SUM(order.totalCents)', 'DESC')
      .getRawMany();

    console.table(report);
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
