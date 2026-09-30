import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { User } from './user.entity.js';
import { OrderItem } from './order-item.entity.js';

export type OrderStatus = 'created' | 'paid' | 'cancelled';

@Entity({ name: 'orders' })
@Check('chk_orders_total_non_negative', '"total_cents" >= 0')
@Check('chk_orders_status', `"status" IN ('created', 'paid', 'cancelled')`)
@Index('idx_orders_user_created_at', { synchronize: false })
@Index('idx_orders_created_created_at', { synchronize: false })
export class Order {
  @OneToMany(() => OrderItem, (item) => item.order)
  items!: Relation<OrderItem[]>;

  @PrimaryGeneratedColumn('identity', { type: 'bigint' })
  id!: string;

  @Column({ name: 'user_id', type: 'bigint' })
  userId!: string;

  @ManyToOne(() => User, (user) => user.orders, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'user_id' })
  user!: Relation<User>;

  @Column({ type: 'text', default: 'created' })
  status!: OrderStatus;

  @Column({ name: 'total_cents', type: 'integer' })
  totalCents!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
