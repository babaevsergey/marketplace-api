# Marketplace API

An educational marketplace REST API built with NestJS, Express, PostgreSQL, and an
OpenAPI 3.0 contract.

The API provides a product catalog and supports creating, retrieving, and listing
orders. Incoming requests and outgoing responses are validated against the OpenAPI
schema with `express-openapi-validator`. Errors are returned as
`application/problem+json`.

Application configuration is validated with Zod during startup. The PostgreSQL
password is stored in a runtime-mounted file and can be rotated without restarting
the Node.js process.

## Features

- NestJS application and dependency injection;
- Zod environment validation with fail-fast startup;
- typed configuration through `ConfigService<Env, true>`;
- PostgreSQL connection pool;
- database password rotation without restarting Node.js;
- secrets excluded from Git and Docker image layers;
- Docker Compose stack with API and PostgreSQL;
- cursor pagination for products and orders;
- order creation with line-item and total price calculation;
- duplicate order protection through `Idempotency-Key`;
- OpenAPI request and response validation;
- consistent Problem Details error responses;
- OpenAPI contract validation with Redocly CLI.

## Requirements

- Node.js 24 or later;
- pnpm 10.26.0 or later;
- Docker with Docker Compose.

## Quick start with Docker

Create the local database secret:

```bash
mkdir -p secrets
printf '%s' 'marketplace_password' > secrets/db_password
```

Start the API and PostgreSQL:

```bash
docker compose up -d --build
```

Check the running services:

```bash
docker compose ps
```

The API is available at:

```text
http://localhost:3000
```

Check the application and database:

```bash
curl -s http://localhost:3000/health
curl -s http://localhost:3000/db
curl -s http://localhost:3000/products
```

Stop the stack without deleting PostgreSQL data:

```bash
docker compose down
```

## Local development

Install dependencies:

```bash
pnpm install
```

Create the local configuration:

```bash
cp .env.example .env
mkdir -p secrets
printf '%s' 'marketplace_password' > secrets/db_password
```

Start only PostgreSQL in Docker:

```bash
docker compose up -d db
```

Start the application locally:

```bash
pnpm start
```

For development with automatic reloads:

```bash
pnpm start:dev
```

The local application connects to PostgreSQL through:

```text
127.0.0.1:21432
```

Inside the Compose network, the API container connects through:

```text
db:5432
```

## Commands

| Command               | Purpose                                          |
| --------------------- | ------------------------------------------------ |
| `pnpm build`          | Compile TypeScript into `dist`                   |
| `pnpm start`          | Build and start the application                  |
| `pnpm start:dev`      | Start the application in watch mode              |
| `pnpm start:legacy`   | Start the previous Express entry point           |
| `pnpm check:env`      | Compare `.env.example` with the Zod schema       |
| `pnpm lint:openapi`   | Validate the OpenAPI contract                    |
| `pnpm bundle:openapi` | Bundle the OpenAPI contract into `spec.json`     |
| `pnpm format`         | Format project files with Prettier               |
| `pnpm format:check`   | Check formatting without modifying project files |

## Configuration

Application configuration is validated with Zod during startup. If a required
variable is missing or invalid, the application exits before opening the HTTP port.

The configuration flow is:

```text
process.env → Zod schema → ConfigService<Env, true> → application
```

| Variable         | Required | Default       | Source                | Description                                  |
| ---------------- | -------- | ------------- | --------------------- | -------------------------------------------- |
| NODE_ENV         | No       | `development` | environment or `.env` | Application environment                      |
| PORT             | No       | `3000`        | environment or `.env` | HTTP server port                             |
| DB_URL           | Yes      | —             | environment or `.env` | PostgreSQL connection URL without a password |
| DB_PASSWORD_FILE | Yes      | —             | environment or `.env` | Path to the database password file           |

The real database password is not stored in `.env`. The application reads it from
`secrets/db_password`. The `.env` file and the complete `secrets` directory are
excluded from Git and the Docker build context.

The committed `.env.example` file is the public configuration contract. It contains
all variables from the Zod schema but no real secrets.

### Environment contract check

Verify that `.env.example` contains exactly the same variables as the Zod schema:

```bash
pnpm check:env
```

The command exits with code `1` when a schema variable is missing from
`.env.example` or when the example contains an unknown variable.

### Fail-fast verification

Temporarily move the local `.env` file:

```bash
mv .env /tmp/marketplace-api-hw11.env
```

Start the application without the required variables:

```bash
env -u DB_URL -u DB_PASSWORD_FILE pnpm start
```

The process must exit with a non-zero code and print the names of the invalid
variables:

```text
Invalid environment configuration:
DB_URL: DB_URL is required
DB_PASSWORD_FILE: DB_PASSWORD_FILE is required
```

Check the exit code:

```bash
echo $?
```

Restore the local configuration:

```bash
mv /tmp/marketplace-api-hw11.env .env
```

## Database Schema and Query Optimization

The main table used for the performance tests is `orders`. The seed creates:

- 10,000 users;
- 50,000 products;
- 100,000 orders;
- 200,000 order items.

### Fresh-clone database access

Start PostgreSQL from a fresh clone with one command:

```bash
docker compose up -d db --wait
```

Connect and verify the database with one command:

```bash
docker compose exec -T db psql -U admin -d marketplace -Atc "SELECT 1"
```

The expected result is:

```text
1
```

The local development credentials used by the PostgreSQL container are defined in
`docker-compose.yml`. The application password remains in the runtime-mounted secret
file and is not committed to Git.

### Reproduce the complete optimization workflow

Remove the existing PostgreSQL volume:

```bash
docker compose down -v
```

Start a clean PostgreSQL instance:

```bash
docker compose up -d db --wait
```

Apply the database schema:

```bash
docker compose exec -T db \
  psql -v ON_ERROR_STOP=1 -U admin -d marketplace \
  < db/schema.sql
```

Generate the test data:

```bash
docker compose exec -T db \
  psql -v ON_ERROR_STOP=1 -U admin -d marketplace \
  < db/seed.sql
```

Verify the number of rows in the main table:

```bash
docker compose exec -T db \
  psql -U admin -d marketplace \
  -Atc "SELECT count(*) FROM orders;"
```

The expected result is:

```text
100000
```

Run the three execution plans before adding indexes:

```bash
docker compose exec -T db \
  psql -U admin -d marketplace \
  -c "EXPLAIN (ANALYZE, BUFFERS) $(cat db/queries/q1.sql)"

docker compose exec -T db \
  psql -U admin -d marketplace \
  -c "EXPLAIN (ANALYZE, BUFFERS) $(cat db/queries/q2.sql)"

docker compose exec -T db \
  psql -U admin -d marketplace \
  -c "EXPLAIN (ANALYZE, BUFFERS) $(cat db/queries/q3.sql)"
```

All three plans must contain `Seq Scan`.

Apply the indexes and update the planner statistics:

```bash
docker compose exec -T db \
  psql -v ON_ERROR_STOP=1 -U admin -d marketplace \
  < db/indexes.sql

docker compose exec -T db \
  psql -U admin -d marketplace \
  -c "ANALYZE;"
```

Run the same three execution plans again:

```bash
docker compose exec -T db \
  psql -U admin -d marketplace \
  -c "EXPLAIN (ANALYZE, BUFFERS) $(cat db/queries/q1.sql)"

docker compose exec -T db \
  psql -U admin -d marketplace \
  -c "EXPLAIN (ANALYZE, BUFFERS) $(cat db/queries/q2.sql)"

docker compose exec -T db \
  psql -U admin -d marketplace \
  -c "EXPLAIN (ANALYZE, BUFFERS) $(cat db/queries/q3.sql)"
```

After indexing, every query must use `Index Scan`, `Index Only Scan`, or
`Bitmap Index Scan` and must not contain `Seq Scan`.

The complete before-and-after execution plans and their explanations are available
in [`db/OPTIMIZATIONS.md`](db/OPTIMIZATIONS.md).

## TypeORM data layer (HW13)

The TypeORM entities describe `users`, `products`, `orders`, and `order_items`.
Money is stored as integer cents. `OrderItem` is an explicit join entity because
the order/product relationship also stores quantity and the price at purchase.
`synchronize` is explicitly `false`; migrations manage the schema.

This workflow is separate from the raw SQL HW12 workflow above. Do not apply
`db/schema.sql` or its large seed to the database used by the initial ORM migration.
Local development checks used the separate database `marketplace_hw13`.

### Deletion rules

| Relationship        | onDelete | Reason                                                   |
| ------------------- | -------- | -------------------------------------------------------- |
| Product → owner     | RESTRICT | Do not delete a user while their products still exist.   |
| Order → user        | RESTRICT | Preserve the buyer referenced by order history.          |
| OrderItem → product | RESTRICT | Preserve products referenced by purchased line items.    |
| OrderItem → order   | CASCADE  | A line item belongs to its order and is removed with it. |

### Migration and seed verification

The initial migration was reverted successfully, appeared as `[ ]`, and was then
reapplied successfully with status `[X]`. The rollback deletes the application
tables and their data; run it only against a disposable development database.

After restoring the schema, two consecutive seed runs each reported 10 users,
10 products, 10 orders, and 10 order items. The seed is deterministic and does not
duplicate these records when rerun.

### N+1 measurements

The demo loads the same graph in both versions: `order → items → product`.
Measured with one item per seeded order:

| Orders | Before: queries inside loops | After: explicit JOINs |
| ------ | ---------------------------- | --------------------- |
| 5      | 11                           | 1                     |
| 10     | 21                           | 1                     |

The naive version executes one query for the orders, one per order for its items,
and one per item for its product. The fixed version executes a single SQL query,
including a subquery that limits orders before joining their items. The query
count stays constant, although the amount of returned data grows with the input.

A custom TypeORM logger counts actual SQL queries, excluding connection setup.
The demo asserts that both versions return the same data and that the JOIN
version executes exactly one query. SQL text is hidden by default for readability.

```bash
pnpm demo:nplus1
SHOW_SQL=1 pnpm demo:nplus1
```

## Concurrency (HW14)

Checkout decrements product stock, debits the buyer balance, inserts the order and
line item, and enqueues a receipt job in one database transaction. Any failed step
rolls back every earlier step, so the database cannot contain a charged buyer
without an order or an order without its queued post-processing task.

### Atomic checkout and race result

Stock is protected with an atomic conditional update:

```sql
UPDATE products
SET stock = stock - $1
WHERE id = $2
  AND stock >= $1
RETURNING id, price_cents, stock;
```

This approach was chosen instead of a separate `SELECT ... FOR UPDATE` because the
availability check and decrement are expressed as one statement. PostgreSQL locks
the row while applying it, and zero returned rows means that the product is missing
or no longer has enough stock. The same pattern protects the buyer balance.

Measured race-demo result for 50 parallel checkout attempts with initial stock 10
and quantity 1:

| Metric              | Result |
| ------------------- | -----: |
| Attempts            |     50 |
| Successful checkout |     10 |
| Rejected checkout   |     40 |
| Final stock         |      0 |
| Negative stock rows |      0 |

```bash
pnpm demo:race
```

### Worker pool with SKIP LOCKED

Three workers process a dedicated batch of 12 jobs. Each worker selects one pending
job with `FOR UPDATE SKIP LOCKED`, keeps the transaction open during processing,
and commits the result together with `status = 'done'`. If no unlocked row is
available, the worker checks whether pending rows still exist before exiting,
because an empty `SKIP LOCKED` result may mean that other workers currently hold
all remaining rows.

Measured result:

| Metric              | Result    |
| ------------------- | --------- |
| Worker distribution | 4 / 4 / 4 |
| Processed twice     | 0         |
| Parallel time       | 922 ms    |
| Sequential estimate | 2400 ms   |

```bash
pnpm demo:workers
```

### Transaction retry

The retry demo runs two concurrent read-modify-write transactions under
`REPEATABLE READ`. Both first attempts read the same snapshot, PostgreSQL aborts
one with `40001`, and the wrapper reruns that transaction from its first read.
The measured run performed one retry and produced the correct final balance:
`100000 + 100 + 200 = 100300`.

Only `40001` (serialization failure) and `40P01` (deadlock detected) are retried
because they represent transient concurrency conflicts. Syntax errors, missing
tables, invalid input, and constraint violations are deterministic failures and
will not be fixed by retrying the same transaction.

```bash
pnpm demo:retry
```

## Grading

Use Node.js 24. The repository commits both `pnpm-lock.yaml` for development and
`package-lock.json` for the grader's required `npm ci` command.

The following workflow targets a fresh Compose volume, where `marketplace` is
created by Compose and contains no HW12 or ORM application tables. Do not run it
against an existing HW12 schema. A new clone alone does not guarantee a new Docker
volume. Do not delete a volume containing data you need.

Create the local development password file required by the API container. This
does not overwrite an existing secret:

```bash
mkdir -p secrets
if [ ! -f secrets/db_password ]; then
  printf '%s' 'marketplace_password' > secrets/db_password
fi
```

Start the stack and configure the host-side ORM commands with the development
credentials from `docker-compose.yml`:

```bash
docker compose up -d --wait
export DB_HOST=127.0.0.1 DB_PORT=21432 DB_USER=admin DB_PASSWORD=admin-local-only DB_NAME=marketplace
export SKIP_VAULT=1
npm ci
npx tsc --noEmit
npm run build
npm run migrate
npm run migrate:show
```

For the existing isolated local database, use `export DB_NAME=marketplace_hw14`
instead. The ORM CLI configuration uses `DB_*`; the Nest API still uses its
separate `DB_URL` and `DB_PASSWORD_FILE` configuration.

Verify rollback and reapplication before loading data. **Reverting the initial
migration deletes all four application tables and their contents.**

```bash
pnpm migrate:revert
pnpm migrate:show
pnpm migrate
pnpm migrate:show
```

The migration should be `[ ]` after rollback and `[X]` after reapplication.
Run the seed twice, checking counts after each run:

```bash
pnpm seed
docker compose exec -T db psql -U admin -d "$DB_NAME" -c "SELECT 'users' AS table_name, count(*) FROM users UNION ALL SELECT 'products', count(*) FROM products UNION ALL SELECT 'orders', count(*) FROM orders UNION ALL SELECT 'order_items', count(*) FROM order_items;"
pnpm seed
docker compose exec -T db psql -U admin -d "$DB_NAME" -c "SELECT 'users' AS table_name, count(*) FROM users UNION ALL SELECT 'products', count(*) FROM products UNION ALL SELECT 'orders', count(*) FROM orders UNION ALL SELECT 'order_items', count(*) FROM order_items;"
pnpm demo:nplus1
pnpm report
pnpm demo:race
pnpm demo:workers
pnpm demo:retry
```

On a clean seeded database, both count checks return 10 for each table. The N+1
results should match the table above. The report returns seven buyers with paid
orders, sorted by total spending descending. The three concurrency demos verify
the race, worker-pool, and retry invariants documented above.

All database scripts use `scripts/with-secrets.sh`. Without `SKIP_VAULT=1`, the
wrapper invokes `infisical run --env=dev`; this requires an installed and
authenticated Infisical CLI and a configured project. The DataSource reads
connection settings only from `process.env`. Verification so far used the local
bypass; the Infisical path and the full fresh-clone workflow still require a
separate end-to-end check.

## Repository vs QueryBuilder

We use Repository methods such as `find`, `findOneBy`, and `save` for
straightforward entity reads and writes. We use QueryBuilder when a query needs
explicit joins, aggregation, grouping, or a custom result shape that cannot be
expressed with `find()`.

The spending report in `src/reports.ts` joins orders with users, filters paid
orders, and calculates the order count and total spending per buyer. It uses
`getRawMany()` because the result contains calculated report fields rather than
Order entities. Spending is reported in cents.

### Run the report

With the database running, migrations applied, seed data loaded, and database
environment variables configured:

```bash
pnpm build
pnpm report
```

The report command uses `scripts/with-secrets.sh` to load configuration through
Infisical. For a local run with `DB_*` variables already exported, set
`SKIP_VAULT=1` to bypass Infisical.

## Database connection

The application uses `pg.Pool` with a maximum of five connections.

The password is provided as an asynchronous function:

```ts
password: async () => {
  const password = await readFile(passwordFile, 'utf8');
  return password.trim();
};
```

The function reads the current password whenever the pool creates a new PostgreSQL
connection. Existing connections do not authenticate again until they are closed.

Check the connection:

```bash
curl -s http://localhost:3000/db
```

Example response:

```json
{
  "status": "ok",
  "current_user": "app_user",
  "database_time": "2026-09-05T08:25:31.445Z",
  "uptime_seconds": 25
}
```

## Database password rotation

Keep the application running and record its uptime:

```bash
curl -s http://localhost:3000/health
```

Rotate the database password:

```bash
bash rotate.sh
```

The script performs the following operations:

1. Generates a new random password.
2. Changes the password of `app_user` in PostgreSQL.
3. Atomically updates `secrets/db_password`.
4. Terminates existing `app_user` connections.

Verify that PostgreSQL remains available:

```bash
curl -s http://localhost:3000/db
```

Check the process uptime again:

```bash
curl -s http://localhost:3000/health
```

The second uptime value must be greater than the first one. This proves that the
pool opened a new connection with the updated password without restarting the
Node.js process.

Environment variables are inherited when a process starts. Changing an external
`.env` file does not mutate `process.env` inside an already running process. The
password is therefore stored in a file that can be reread when the pool creates a
new connection.

If the PostgreSQL volume is deleted, restore the initial local password before
creating a new database:

```bash
docker compose down -v
printf '%s' 'marketplace_password' > secrets/db_password
docker compose up -d --build
```

## Docker image security checks

Build the image:

```bash
docker build -t marketplace-api:hw-11 .
```

Inspect its files:

```bash
docker run --rm marketplace-api:hw-11 ls -la /app
```

The image contains `.env.example`, but does not contain `.env`, `secrets`, or
TypeScript source files.

Verify that the real `.env` file is absent:

```bash
docker run --rm marketplace-api:hw-11 \
  sh -c 'cat /app/.env' 2>&1
```

The expected result is:

```text
cat: /app/.env: No such file or directory
```

Verify that the final process does not run as root:

```bash
docker run --rm marketplace-api:hw-11 id -u
```

The expected UID is not `0`.

Inspect image environment variables:

```bash
docker inspect \
  --format '{{.Config.Env}}' \
  marketplace-api:hw-11
```

Inspect the image history:

```bash
docker history --no-trunc marketplace-api:hw-11 |
  grep -i password
```

The history command must not find any password.

Verify that local secret files are ignored by Git:

```bash
git check-ignore .env
git check-ignore secrets/db_password
git ls-files .env
```

The first two commands print the ignored paths. The last command must produce no
output.

## API

### Health check

```http
GET /health
```

Example:

```bash
curl -s http://localhost:3000/health
```

```json
{
  "status": "ok",
  "uptime_seconds": 25
}
```

### Database check

```http
GET /db
```

Example:

```bash
curl -s http://localhost:3000/db
```

The endpoint executes a real PostgreSQL query and returns the current database user,
database time, and Node.js process uptime.

### List products

```http
GET /products?limit=2
```

Query parameters:

| Parameter | Description                                                |
| --------- | ---------------------------------------------------------- |
| `limit`   | Page size from 1 to 100. Defaults to 20                    |
| `cursor`  | Cursor returned in the previous page's `next_cursor` field |

Example:

```bash
curl 'http://localhost:3000/products?limit=2'
```

```json
{
  "items": [
    {
      "id": "product_1",
      "name": "Mechanical Keyboard",
      "description": "RGB mechanical keyboard",
      "price_cents": 19999,
      "available": true
    },
    {
      "id": "product_2",
      "name": "Automative Keyboard",
      "description": "RGB automative keyboard",
      "price_cents": 29999,
      "available": true
    }
  ],
  "next_cursor": "cHJvZHVjdF8y"
}
```

Pass the returned cursor unchanged to retrieve the next page:

```bash
curl 'http://localhost:3000/products?limit=2&cursor=cHJvZHVjdF8y'
```

When there are no more results, `next_cursor` is `null`. An unknown cursor returns
status `400`.

### Create an order

```http
POST /orders
Content-Type: application/json
Idempotency-Key: <unique key>
```

Example:

```bash
curl --request POST 'http://localhost:3000/orders' \
  --header 'Content-Type: application/json' \
  --header 'Idempotency-Key: checkout-123' \
  --data '{
    "items": [
      { "product_id": "product_1", "quantity": 2 },
      { "product_id": "product_2", "quantity": 1 }
    ]
  }'
```

A successful response has status `201`:

```json
{
  "id": "order_1",
  "items": [
    {
      "product_id": "product_1",
      "quantity": 2,
      "unit_price_cents": 19999,
      "line_total_cents": 39998
    },
    {
      "product_id": "product_2",
      "quantity": 1,
      "unit_price_cents": 29999,
      "line_total_cents": 29999
    }
  ],
  "total_cents": 69997,
  "status": "created",
  "created_at": "2026-08-24T12:00:00.000Z"
}
```

Repeating a request with the same `Idempotency-Key` and request body returns the
stored order with the `Idempotency-Replay: true` response header. Reusing the same
key with a different body returns status `422`.

An unknown `product_id` returns status `400`.

### List orders

```http
GET /orders?limit=20&cursor=<cursor>
```

Pagination works the same way as product pagination:

```bash
curl 'http://localhost:3000/orders?limit=2'
```

### Get an order by ID

```http
GET /orders/{orderId}
```

Example:

```bash
curl 'http://localhost:3000/orders/order_1'
```

A missing order returns status `404`.

## Error format

Application and OpenAPI validation errors use the
`application/problem+json` content type:

```json
{
  "type": "https://marketplace.dev/problems/request-error",
  "title": "Bad Request",
  "status": 400,
  "detail": "Unknown cursor",
  "instance": "/products?cursor=unknown"
}
```

Common statuses:

| Status | Returned when                                                     |
| ------ | ----------------------------------------------------------------- |
| `400`  | Request validation fails, or a product or cursor is unknown       |
| `404`  | The requested order does not exist                                |
| `422`  | An idempotency key is reused with a different request body        |
| `500`  | An internal error occurs or a handler returns an invalid response |

## OpenAPI

The source contract is located at `openapi/openapi.yaml`. It defines request
parameters, response bodies, and the `Product`, `Order`, `ProductPage`, `OrderPage`,
and `Problem` schemas.

`express-openapi-validator` validates documented requests and responses at runtime.
The NestJS `/health` and `/db` endpoints are currently allowed as undocumented
routes.

Validate the contract:

```bash
pnpm lint:openapi
```

Bundle the specification:

```bash
pnpm bundle:openapi
```

## Project structure

```text
marketplace-api/
├── docker/
│   └── init.sql
├── openapi/
│   └── openapi.yaml
├── scripts/
│   └── check-env-example.mjs
├── secrets/
│   └── db_password
├── src/
│   ├── config/
│   │   └── env.schema.ts
│   ├── database/
│   │   ├── database.module.ts
│   │   └── database.service.ts
│   ├── middleware/
│   │   └── problem-handler.js
│   ├── routes/
│   │   ├── orders.js
│   │   └── products.js
│   ├── app.controller.ts
│   ├── app.module.ts
│   └── main.ts
├── .dockerignore
├── .env.example
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── package.json
├── pnpm-lock.yaml
├── rotate.sh
├── tsconfig.json
└── README.md
```

The `secrets/db_password` and `.env` files exist only locally and are not committed.

## Current limitations

The `/db` endpoint uses PostgreSQL to verify connectivity and database password
rotation. Products, orders, and idempotency records are still stored in process
memory and will be migrated to PostgreSQL in a later database assignment.
