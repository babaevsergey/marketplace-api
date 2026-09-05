import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import type { Env } from '../config/env.schema.js';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: pg.Pool;

  constructor(config: ConfigService<Env, true>) {
    const connectionString = config.get('DB_URL', { infer: true });
    const passwordFile = config.get('DB_PASSWORD_FILE', { infer: true });

    const databaseUrl = new URL(connectionString);

    this.pool = new pg.Pool({
      host: databaseUrl.hostname,
      port: Number(databaseUrl.port || 5432),
      database: databaseUrl.pathname.slice(1),
      user: decodeURIComponent(databaseUrl.username),

      password: async () => {
        const password = await readFile(passwordFile, 'utf8');
        return password.trim();
      },

      max: 5,
    });

    this.pool.on('error', (error) => {
      console.error('Postgres closed an idle connection:', error.message);
    });
  }

  async checkConnection() {
    const result = await this.pool.query<{
      current_user: string;
      database_time: Date;
    }>(`
      SELECT
        current_user,
        now() AS database_time
    `);

    return result.rows[0];
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
