SELECT
    id,
    user_id,
    status,
    total,
    created_at
FROM orders
WHERE user_id = 42
  AND created_at >= now() - interval '90 days'
ORDER BY created_at DESC;
