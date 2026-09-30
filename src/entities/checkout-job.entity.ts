import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Order } from './order.entity.js';

export type CheckoutJobStatus = 'pending' | 'done';

@Entity({ name: 'checkout_jobs' })
@Check('chk_checkout_jobs_status', `"status" IN ('pending', 'done')`)
@Check('chk_checkout_jobs_processed_count', '"processed_count" >= 0')
@Index('idx_checkout_jobs_status_id', ['status', 'id'])
export class CheckoutJob {
  @PrimaryGeneratedColumn('identity', { type: 'bigint' })
  id!: string;

  @Column({ name: 'order_id', type: 'bigint' })
  orderId!: string;

  @ManyToOne(() => Order, (order) => order.jobs, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'order_id' })
  order!: Relation<Order>;

  @Column({ type: 'text', default: 'send_receipt' })
  type!: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ type: 'text', default: 'pending' })
  status!: CheckoutJobStatus;

  @Column({ name: 'processed_count', type: 'integer', default: 0 })
  processedCount!: number;

  @Column({ name: 'processed_by', type: 'text', nullable: true })
  processedBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({
    name: 'processed_at',
    type: 'timestamptz',
    nullable: true,
  })
  processedAt!: Date | null;
}
