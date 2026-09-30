import { strictEqual, ok } from 'node:assert';
import { randomUUID } from 'node:crypto';
import dataSource from './data-source.js';

const WORKER_COUNT = 3;
const TASK_COUNT = 12;
const PROCESSING_TIME_MS = 200;
const POLL_TIME_MS = 20;

type IdRow = { id: string };
type CountRow = { count: string };

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function runWorker(workerId: string, runId: string): Promise<number> {
  let processed = 0;

  while (true) {
    const claimed = await dataSource.transaction(async (manager) => {
      const jobs = await manager.query<IdRow[]>(
        `
          SELECT id
          FROM checkout_jobs
          WHERE status = 'pending'
            AND payload->>'runId' = $1
          ORDER BY id
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        `,
        [runId],
      );

      const job = jobs[0];

      if (!job) {
        return false;
      }

      // Keep the row lock until processing and the status update commit together.
      await wait(PROCESSING_TIME_MS);

      await manager.query(
        `
          UPDATE checkout_jobs
          SET status = 'done',
              processed_count = processed_count + 1,
              processed_by = $1,
              processed_at = now()
          WHERE id = $2
            AND status = 'pending'
        `,
        [workerId, job.id],
      );

      return true;
    });

    if (claimed) {
      processed += 1;
      continue;
    }

    // No unlocked row does not necessarily mean the queue is empty.
    const pendingRows = await dataSource.query<CountRow[]>(
      `
        SELECT COUNT(*) AS count
        FROM checkout_jobs
        WHERE status = 'pending'
          AND payload->>'runId' = $1
      `,
      [runId],
    );

    if (Number(pendingRows[0]?.count ?? 0) === 0) {
      return processed;
    }

    await wait(POLL_TIME_MS);
  }
}

async function main(): Promise<void> {
  await dataSource.initialize();

  try {
    const orders = await dataSource.query<IdRow[]>(`SELECT id FROM orders ORDER BY id LIMIT 1`);
    const order = orders[0];

    if (!order) {
      throw new Error('Run the seed before demo:workers');
    }

    const runId = randomUUID();

    await dataSource.query(
      `
        INSERT INTO checkout_jobs (order_id, payload)
        SELECT
          $1,
          jsonb_build_object(
            'demo', 'workers',
            'runId', $2::text,
            'taskNumber', task_number
          )
        FROM generate_series(1, $3::integer) AS task_number
      `,
      [order.id, runId, TASK_COUNT],
    );

    const startedAt = performance.now();
    const distribution = await Promise.all(
      Array.from({ length: WORKER_COUNT }, (_, index) => runWorker(`worker-${index + 1}`, runId)),
    );
    const elapsedMs = Math.round(performance.now() - startedAt);
    const sequentialEstimateMs = TASK_COUNT * PROCESSING_TIME_MS;

    const doneRows = await dataSource.query<CountRow[]>(
      `
        SELECT COUNT(*) AS count
        FROM checkout_jobs
        WHERE status = 'done'
          AND payload->>'runId' = $1
      `,
      [runId],
    );
    const duplicateRows = await dataSource.query<CountRow[]>(
      `
        SELECT COUNT(*) AS count
        FROM checkout_jobs
        WHERE processed_count > 1
          AND payload->>'runId' = $1
      `,
      [runId],
    );

    const done = Number(doneRows[0]?.count ?? 0);
    const processedTwice = Number(duplicateRows[0]?.count ?? 0);

    console.log(`Tasks: ${TASK_COUNT}`);
    console.log(`Workers: ${WORKER_COUNT}`);
    distribution.forEach((count, index) => {
      console.log(`worker-${index + 1}: ${count}`);
    });
    console.log(`Processed twice: ${processedTwice}`);
    console.log(`Elapsed: ${elapsedMs} ms`);
    console.log(`Sequential estimate: ${sequentialEstimateMs} ms`);

    strictEqual(done, TASK_COUNT, 'Every task must be processed');
    strictEqual(processedTwice, 0, 'No task may be processed twice');
    strictEqual(
      distribution.reduce((sum, count) => sum + count, 0),
      TASK_COUNT,
      'Worker totals must match the task count',
    );
    ok(
      distribution.filter((count) => count > 0).length >= 2,
      'At least two workers must process tasks',
    );
    ok(elapsedMs < sequentialEstimateMs, 'Worker pool must be faster than sequential processing');

    console.log('Invariant: OK');
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
