import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),

  DB_URL: z.string().min(1, 'DB_URL is required'),

  DB_PASSWORD_FILE: z.string().min(1, 'DB_PASSWORD_FILE is required'),
});

export type Env = z.infer<typeof envSchema>;

export function validate(rawConfig: Record<string, unknown>): Env {
  const result = envSchema.safeParse(rawConfig);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => {
        const variable = issue.path.join('.') || 'environment';
        return `${variable}: ${issue.message}`;
      })
      .join('\n');

    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return result.data;
}
