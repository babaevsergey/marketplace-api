CREATE TABLE users (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email text NOT NULL UNIQUE,
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_id bigint NOT NULL REFERENCES users(id),
    name text NOT NULL,
    description text,
    price numeric(12, 2) NOT NULL CHECK (price >= 0),
    available boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE orders (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id bigint NOT NULL REFERENCES users(id),
    status text NOT NULL DEFAULT 'created'
        CHECK (status IN ('created', 'paid', 'cancelled')),
    total numeric(12, 2) NOT NULL CHECK (total >= 0),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
     id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     order_id bigint NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
     product_id bigint NOT NULL REFERENCES products(id),
     quantity integer NOT NULL CHECK (quantity > 0),
     unit_price numeric(12, 2) NOT NULL CHECK (unit_price >= 0),

     UNIQUE (order_id, product_id)
);
