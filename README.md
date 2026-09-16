# Marketplace API

An educational marketplace REST API built with Express and an OpenAPI 3.0 contract.
The API provides a product catalog and supports creating, retrieving, and listing
orders.

Incoming requests and outgoing responses are validated against the OpenAPI schema
with `express-openapi-validator`. Errors are returned as
`application/problem+json`.

## Chosen approach

**Variant B — runtime validation at the boundary.**

`express-openapi-validator` validates incoming requests and outgoing responses
against `openapi/openapi.yaml`. Errors are converted to
`application/problem+json`.

## Features

- cursor pagination for products and orders;
- order creation with line-item and total price calculation;
- duplicate order protection through `Idempotency-Key`;
- OpenAPI request and response validation;
- consistent Problem Details error responses;
- code formatting with Prettier;
- OpenAPI contract validation with Redocly CLI.

## Requirements

- Node.js 20.19 or later;
- pnpm 9 or later.

## Installation and startup

```bash
pnpm install
pnpm start
```

The API will be available at `http://localhost:3000`.

To start the server with automatic reloads when files change:

```bash
pnpm dev
```

## Commands

| Command               | Purpose                                          |
| --------------------- | ------------------------------------------------ |
| `pnpm start`          | Start the API                                    |
| `pnpm dev`            | Start the API in watch mode                      |
| `pnpm lint:openapi`   | Validate the OpenAPI contract                    |
| `pnpm bundle:openapi` | Bundle the contract into `spec.json`             |
| `pnpm format`         | Format project files with Prettier               |
| `pnpm format:check`   | Check formatting without modifying project files |

## API

### List products

```http
GET /products?limit=2
```

Query parameters:

| Parameter | Description                                                      |
| --------- | ---------------------------------------------------------------- |
| `limit`   | Page size from 1 to 100. Defaults to 20                          |
| `cursor`  | The cursor from the previous page's `next_cursor` response field |

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

Repeating a request with the same `Idempotency-Key` and body returns the stored order
with the `Idempotency-Replay: true` response header. Reusing the key with a different
body returns status `422`.

If the order contains an unknown `product_id`, the API returns status `400`.

### List orders

```http
GET /orders?limit=20&cursor=<cursor>
```

Pagination works the same way as for `/products`: the next page cursor is returned
in `next_cursor`, and the final page contains `"next_cursor": null`.

```bash
curl 'http://localhost:3000/orders?limit=2'
```

### Get an order by ID

```http
GET /orders/{orderId}
```

```bash
curl 'http://localhost:3000/orders/order_1'
```

If the order does not exist, the API returns status `404`.

## Acceptance checks

Start the API with `pnpm start` before running these commands.

```bash
# Missing Idempotency-Key → 400 problem+json
curl -i -X POST http://localhost:3000/orders \
  -H 'Content-Type: application/json' \
  -d '{"items":[{"product_id":"product_1","quantity":1}]}'
```

```bash
# Empty items → 400 from the OpenAPI validator
curl -i -X POST http://localhost:3000/orders \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: invalid-items-check' \
  -d '{"items":[]}'
```

```bash
# Valid request → 201
curl -i -X POST http://localhost:3000/orders \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: valid-order-check' \
  -d '{"items":[{"product_id":"product_1","quantity":1}]}'
```

## Error format

Application and OpenAPI validation errors use the
`application/problem+json` Content-Type:

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

| Status | Returned when                                                      |
| ------ | ------------------------------------------------------------------ |
| `400`  | The request violates the schema, or a product or cursor is unknown |
| `404`  | The requested order does not exist                                 |
| `422`  | An idempotency key is reused with a different request body         |
| `500`  | An internal error occurs or a handler returns an invalid response  |

## OpenAPI

The source contract is located at
[`openapi/openapi.yaml`](openapi/openapi.yaml). It defines request parameters,
response bodies, and the `Product`, `Order`, `ProductPage`, `OrderPage`, and `Problem`
schemas.

The validation middleware runs before the routers, so requests are validated before
they reach a handler. The response validator also checks handler results. For
example, an extra field in a schema with `additionalProperties: false` causes a
validation error instead of sending an invalid response to the client.

Validate the contract:

```bash
pnpm lint:openapi
```

Bundle the specification into a single JSON file:

```bash
pnpm bundle:openapi
```

## Project structure

```text
marketplace-api/
├── openapi/
│   └── openapi.yaml
├── src/
│   ├── middleware/
│   │   └── problem-handler.js
│   ├── routes/
│   │   ├── orders.js
│   │   └── products.js
│   └── app.js
├── package.json
└── README.md
```

## Current limitations

This project is intended for learning and does not use a database. Products are
defined directly in the source code, while orders and idempotency records are stored
in process memory. All created orders are lost when the server restarts.
