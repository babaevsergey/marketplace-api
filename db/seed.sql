INSERT INTO users (email, name, created_at)
SELECT
    'user' || number || '@example.com',
    'User ' || number,
    now() - (number % 365) * interval '1 day'
FROM generate_series(1, 10000) AS series(number);

INSERT INTO products (
    owner_id,
    name,
    description,
    price,
    available,
    created_at
)
SELECT
    ((number - 1) % 10000) + 1,
    'Product ' || number,
    'Description for product ' || number,
    round((10 + (number % 100000) / 100.0)::numeric, 2),
    number % 10 <> 0,
    now() - (number % 365) * interval '1 day'
FROM generate_series(1, 50000) AS series(number);

INSERT INTO orders (
    user_id,
    status,
    total,
    created_at
)
SELECT
    ((number - 1) % 10000) + 1,
    CASE
    WHEN status_roll < 0.70 THEN 'paid'
    WHEN status_roll < 0.90 THEN 'cancelled'
    ELSE 'created'
END,
    0,
    now() - (number % 730) * interval '1 day'
FROM (
    SELECT
        number,
        random() AS status_roll
    FROM generate_series(1, 100000) AS series(number)
) AS generated_orders;

INSERT INTO order_items (
    order_id,
    product_id,
    quantity,
    unit_price
)
SELECT
    generated.order_id,
    product.id,
    generated.quantity,
    product.price
FROM (
     SELECT
         order_number AS order_id,
         ((order_number * 2 + item_number - 2) % 50000) + 1 AS product_id,
         1 + ((order_number + item_number) % 3) AS quantity
    FROM generate_series(1, 100000) AS orders(order_number)
    CROSS JOIN generate_series(1, 2) AS items(item_number)
) AS generated
JOIN products AS product ON product.id = generated.product_id;

UPDATE orders AS order_record
SET total = calculated.total
    FROM (
    SELECT
        order_id,
        sum(quantity * unit_price) AS total
    FROM order_items
    GROUP BY order_id
) AS calculated
WHERE calculated.order_id = order_record.id;

VACUUM (ANALYZE);
