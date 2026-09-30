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
} from 'typeorm';
import { User } from './user.entity.js';
import type { Relation } from 'typeorm';
import { OrderItem } from './order-item.entity.js';

@Entity({ name: 'products' })
@Check('chk_products_price_cents_non_negative', '"price_cents" >= 0')
@Index('idx_products_lower_name', { synchronize: false })
export class Product {
  @OneToMany(() => OrderItem, (item) => item.product)
  orderItems!: Relation<OrderItem[]>;

  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
  })
  id!: string;

  @Column({
    name: 'owner_id',
    type: 'bigint',
  })
  ownerId!: string;

  @ManyToOne(() => User, (user) => user.products, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'owner_id',
  })
  owner!: Relation<User>;

  @Column({
    type: 'text',
  })
  name!: string;

  @Column({
    type: 'text',
    nullable: true,
  })
  description!: string | null;

  @Column({
    name: 'price_cents',
    type: 'integer',
  })
  priceCents!: number;

  @Column({
    type: 'boolean',
    default: true,
  })
  available!: boolean;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
  })
  createdAt!: Date;
}
