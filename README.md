# Marketplace API

Учебный REST API маркетплейса на Express с контрактом OpenAPI 3.0. API позволяет
получать каталог товаров и создавать, просматривать и листать заказы.

Входящие запросы и исходящие ответы проверяются по OpenAPI-схеме с помощью
`express-openapi-validator`. Ошибки возвращаются в формате
`application/problem+json`.

## Обраний варіант

**Варіант Б — runtime-валідація на кордоні.**

`express-openapi-validator` перевіряє вхідні запити та відповіді відповідно до
`openapi/openapi.yaml`. Помилки перетворюються на `application/problem+json`.

## Возможности

- cursor-пагинация товаров и заказов;
- создание заказа с расчётом стоимости каждой позиции и общей суммы;
- защита от повторного создания заказа через `Idempotency-Key`;
- валидация request и response по OpenAPI;
- единый формат ошибок Problem Details;
- форматирование проекта через Prettier;
- проверка OpenAPI-контракта через Redocly CLI.

## Требования

- Node.js 20.19 или новее;
- pnpm 9 или новее.

## Установка и запуск

```bash
pnpm install
pnpm start
```

API будет доступен по адресу `http://localhost:3000`.

Для запуска с автоматической перезагрузкой при изменении файлов:

```bash
pnpm dev
```

## Команды

| Команда               | Назначение                                    |
| --------------------- | --------------------------------------------- |
| `pnpm start`          | Запустить API                                 |
| `pnpm dev`            | Запустить API в watch-режиме                  |
| `pnpm lint:openapi`   | Проверить OpenAPI-контракт                    |
| `pnpm bundle:openapi` | Собрать контракт в `spec.json`                |
| `pnpm format`         | Отформатировать файлы через Prettier          |
| `pnpm format:check`   | Проверить форматирование без изменения файлов |

## API

### Получить товары

```http
GET /products?limit=2
```

Query-параметры:

| Параметр | Описание                                         |
| -------- | ------------------------------------------------ |
| `limit`  | Размер страницы от 1 до 100. По умолчанию — 20   |
| `cursor` | Cursor из поля `next_cursor` предыдущей страницы |

Пример:

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

Чтобы получить следующую страницу, передайте полученный cursor без изменения:

```bash
curl 'http://localhost:3000/products?limit=2&cursor=cHJvZHVjdF8y'
```

Когда данные закончатся, `next_cursor` будет равен `null`. Неизвестный cursor
возвращает статус `400`.

### Создать заказ

```http
POST /orders
Content-Type: application/json
Idempotency-Key: <уникальный ключ>
```

Пример:

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

Успешный ответ имеет статус `201`:

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

Повторный запрос с тем же `Idempotency-Key` и тем же телом возвращает сохранённый
заказ и заголовок `Idempotency-Replay: true`. Если использовать этот ключ с другим
телом, API вернёт статус `422`.

Если в заказе указан неизвестный `product_id`, API вернёт статус `400`.

### Получить список заказов

```http
GET /orders?limit=20&cursor=<cursor>
```

Пагинация работает так же, как для `/products`: cursor следующей страницы приходит
в `next_cursor`, а последняя страница содержит `"next_cursor": null`.

```bash
curl 'http://localhost:3000/orders?limit=2'
```

### Получить заказ по ID

```http
GET /orders/{orderId}
```

```bash
curl 'http://localhost:3000/orders/order_1'
```

Если заказ не найден, API возвращает статус `404`.

## Acceptance-проверки

Перед выполнением команд запустите API через `pnpm start`.

```bash
# Отсутствует Idempotency-Key → 400 problem+json
curl -i -X POST http://localhost:3000/orders \
  -H 'Content-Type: application/json' \
  -d '{"items":[{"product_id":"product_1","quantity":1}]}'
```

```bash
# Пустой items → 400 от OpenAPI-validator
curl -i -X POST http://localhost:3000/orders \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: invalid-items-check' \
  -d '{"items":[]}'
```

```bash
# Валидный запрос → 201
curl -i -X POST http://localhost:3000/orders \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: valid-order-check' \
  -d '{"items":[{"product_id":"product_1","quantity":1}]}'
```

## Формат ошибок

Ошибки приложения и ошибки OpenAPI-валидации возвращаются с Content-Type
`application/problem+json`:

```json
{
  "type": "https://marketplace.dev/problems/request-error",
  "title": "Bad Request",
  "status": 400,
  "detail": "Unknown cursor",
  "instance": "/products?cursor=unknown"
}
```

Основные статусы:

| Статус | Когда возвращается                                          |
| ------ | ----------------------------------------------------------- |
| `400`  | Запрос не соответствует схеме, неизвестный товар или cursor |
| `404`  | Заказ не найден                                             |
| `422`  | Idempotency key уже использован с другим телом              |
| `500`  | Внутренняя ошибка сервера или некорректный ответ handler    |

## OpenAPI

Исходный контракт находится в [`openapi/openapi.yaml`](openapi/openapi.yaml). Он
описывает параметры запросов, тела ответов и схемы `Product`, `Order`, `ProductPage`,
`OrderPage` и `Problem`.

Middleware подключён до routers, поэтому сначала проверяется запрос. Response
validator также проверяет результат handler: например, лишнее поле при
`additionalProperties: false` приведёт к ошибке вместо отправки некорректного ответа
клиенту.

Проверить контракт:

```bash
pnpm lint:openapi
```

Собрать единый JSON-файл спецификации:

```bash
pnpm bundle:openapi
```

## Структура проекта

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

## Ограничения текущей реализации

Проект предназначен для обучения и пока не использует базу данных. Список товаров
задан непосредственно в коде, а заказы и idempotency-записи хранятся в памяти
процесса. После перезапуска сервера созданные заказы будут потеряны.
