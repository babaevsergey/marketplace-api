import { ok, strictEqual } from 'node:assert';
import dataSource from './data-source.js';

const INITIAL_BALANCE_CENTS = 100_000;
const INCREMENTS = [100, 200] as const;
const MAX_ATTEMPTS = 5;
const RETRYABLE_CODES = new Set(['40001', '40P01']);

type UserRow = {
  id: string;
  balance_cents: number;
};

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function getPostgresCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  const candidate = error as {
    code?: unknown;
    driverError?: { code?: unknown };
  };

  if (typeof candidate.code === 'string') {
    return candidate.code;
  }

  return typeof candidate.driverError?.code === 'string' ? candidate.driverError.code : undefined;
}

function createBarrier(parties: number): () => Promise<void> {
  let arrived = 0;
  let release!: () => void;
  const allArrived = new Promise<void>((resolve) => {
    release = resolve;
  });

  return async () => {
    arrived += 1;
    if (arrived === parties) {
      release();
    }
    await allArrived;
  };
}

async function main(): Promise<void> {
  await dataSource.initialize();

  try {
    const users = await dataSource.query<UserRow[]>(
      `SELECT id, balance_cents FROM users WHERE email = $1`,
      ['seed-user-2@example.com'],
    );
    const user = users[0];

    if (!user) {
      throw new Error('Run the seed before demo:retry');
    }

    await dataSource.query(`UPDATE users SET balance_cents = $1 WHERE id = $2`, [
      INITIAL_BALANCE_CENTS,
      user.id,
    ]);

    const firstAttemptBarrier = createBarrier(INCREMENTS.length);
    let retryCount = 0;

    async function withTransactionRetry<T>(operation: (attempt: number) => Promise<T>): Promise<T> {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        try {
          return await operation(attempt);
        } catch (error: unknown) {
          const code = getPostgresCode(error);

          if (!code || !RETRYABLE_CODES.has(code) || attempt === MAX_ATTEMPTS) {
            throw error;
          }

          retryCount += 1;
          const backoffMs = 25 * attempt;
          console.log(
            `Retry ${retryCount}: caught PostgreSQL ${code}; ` +
              `restarting the whole transaction after ${backoffMs} ms`,
          );
          await wait(backoffMs);
        }
      }

      throw new Error('Retry loop ended unexpectedly');
    }

    async function addToBalance(amount: number): Promise<void> {
      await withTransactionRetry(async (attempt) => {
        await dataSource.transaction('REPEATABLE READ', async (manager) => {
          const rows = await manager.query<UserRow[]>(
            `SELECT id, balance_cents FROM users WHERE id = $1`,
            [user.id],
          );
          const current = rows[0];

          if (!current) {
            throw new Error('Retry demo user disappeared');
          }

          // Both first attempts read the same snapshot before either writes.
          if (attempt === 1) {
            await firstAttemptBarrier();
          }

          const nextBalance = current.balance_cents + amount;
          await manager.query(`UPDATE users SET balance_cents = $1 WHERE id = $2`, [
            nextBalance,
            user.id,
          ]);
        });
      });
    }

    await Promise.all(INCREMENTS.map((amount) => addToBalance(amount)));

    const finalRows = await dataSource.query<UserRow[]>(
      `SELECT id, balance_cents FROM users WHERE id = $1`,
      [user.id],
    );
    const finalBalance = finalRows[0]?.balance_cents;
    const expectedBalance =
      INITIAL_BALANCE_CENTS + INCREMENTS.reduce((sum, amount) => sum + amount, 0);

    console.log(`Initial balance: ${INITIAL_BALANCE_CENTS}`);
    console.log(`Applied increments: ${INCREMENTS.join(' + ')}`);
    console.log(`Retries: ${retryCount}`);
    console.log(`Final balance: ${finalBalance}`);
    console.log(`Expected balance: ${expectedBalance}`);

    ok(retryCount >= 1, 'The demo must provoke at least one retry');
    strictEqual(finalBalance, expectedBalance, 'Final arithmetic result must be correct');

    console.log('Invariant: OK');
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
