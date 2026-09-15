import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  type Relation,
} from 'typeorm';
import { Order } from './order.entity.js';
import { Product } from './product.entity.js';

@Entity({ name: 'order_items' })
@Unique('uq_order_items_order_product', ['orderId', 'productId'])
@Check('chk_order_items_quantity_positive', '"quantity" > 0')
@Check('chk_order_items_unit_price_non_negative', '"unit_price_cents" >= 0')
export class OrderItem {
  @PrimaryGeneratedColumn('identity', { type: 'bigint' })
  id!: string;

  @Column({ name: 'order_id', type: 'bigint' })
  orderId!: string;

  @ManyToOne(() => Order, (order) => order.items, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'order_id' })
  order!: Relation<Order>;

  @Column({ name: 'product_id', type: 'bigint' })
  productId!: string;

  @ManyToOne(() => Product, (product) => product.orderItems, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'product_id' })
  product!: Relation<Product>;

  @Column({ type: 'integer' })
  quantity!: number;

  @Column({ name: 'unit_price_cents', type: 'integer' })
  unitPriceCents!: number;
}
