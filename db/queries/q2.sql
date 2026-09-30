SELECT
    id,
    user_id,
    status,
    total,
    created_at
FROM orders
WHERE status = 'created'
ORDER BY created_at DESC
    LIMIT 100;
