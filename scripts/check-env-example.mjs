import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { envSchema } from '../dist/config/env.schema.js';

const envExample = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');

const schemaKeys = Object.keys(envSchema.shape).sort();
const exampleKeys = Object.keys(parse(envExample)).sort();

const missingKeys = schemaKeys.filter((key) => !exampleKeys.includes(key));
const extraKeys = exampleKeys.filter((key) => !schemaKeys.includes(key));

if (missingKeys.length > 0 || extraKeys.length > 0) {
  if (missingKeys.length > 0) {
    console.error(`Missing from .env.example: ${missingKeys.join(', ')}`);
  }

  if (extraKeys.length > 0) {
    console.error(`Not present in Zod schema: ${extraKeys.join(', ')}`);
  }

  process.exit(1);
}

console.log(`.env.example is synchronized with the schema (${schemaKeys.length} variables)`);
