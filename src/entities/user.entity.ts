import { Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { OneToMany } from 'typeorm';
import { Product } from './product.entity.js';
import { Order } from './order.entity.js';

@Entity({ name: 'users' })
@Check('chk_users_balance_non_negative', '"balance_cents" >= 0')
export class User {
  @OneToMany(() => Product, (product) => product.owner)
  products!: Product[];

  @OneToMany(() => Order, (order) => order.user)
  orders!: Order[];

  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
  })
  id!: string;

  @Index('idx_users_email', {
    unique: true,
  })
  @Column({
    type: 'text',
  })
  email!: string;

  @Column({
    type: 'text',
  })
  name!: string;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
  })
  createdAt!: Date;

  @Column({
    name: 'balance_cents',
    type: 'integer',
    default: 0,
  })
  balanceCents!: number;
}
