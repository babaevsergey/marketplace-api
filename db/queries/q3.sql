SELECT
    id,
    owner_id,
    name,
    price,
    available
FROM products
WHERE lower(name) = lower('PRODUCT 4242');
