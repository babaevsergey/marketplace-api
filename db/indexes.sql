CREATE INDEX idx_orders_user_created_at
    ON orders (user_id, created_at DESC);

CREATE INDEX idx_orders_created_created_at
    ON orders (created_at DESC)
    WHERE status = 'created';

CREATE INDEX idx_products_lower_name
    ON products (lower(name));
