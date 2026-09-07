# Query Optimizations

This document compares the execution plans of three Marketplace API queries before
and after adding targeted PostgreSQL indexes.

The measurements were collected locally with:

```sql
EXPLAIN (ANALYZE, BUFFERS)
```

Exact timings may differ between machines. The important results are the selected
plan nodes, the number of processed buffers, and the removal of sequential scans.

## Query 1: Orders by User and Date

The query returns orders belonging to one user within a specified period, ordered
from newest to oldest.

```sql
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
```

### Before Indexing

```text
Sort  (cost=3623.01..3623.02 rows=1 width=36) (actual time=5.805..5.806 rows=1 loops=1)
  Sort Key: created_at DESC
  Sort Method: quicksort  Memory: 25kB
  Buffers: shared hit=1626
  ->  Seq Scan on orders  (cost=0.00..3623.00 rows=1 width=36) (actual time=1.706..5.786 rows=1 loops=1)
        Filter: ((user_id = 42) AND (created_at >= (now() - '90 days'::interval)))
        Rows Removed by Filter: 99999
        Buffers: shared hit=1623
Planning:
  Buffers: shared hit=100
Planning Time: 0.674 ms
Execution Time: 5.846 ms
```

The sequential scan inspected all 100,000 orders and removed 99,999 rows before
sorting the single matching result.

### Index

```sql
CREATE INDEX idx_orders_user_created_at
ON orders (user_id, created_at DESC);
```

### After Indexing

```text
Index Scan using idx_orders_user_created_at on orders  (cost=0.42..8.44 rows=1 width=36) (actual time=0.258..0.263 rows=1 loops=1)
  Index Cond: ((user_id = 42) AND (created_at >= (now() - '90 days'::interval)))
  Buffers: shared hit=4 read=3
Planning:
  Buffers: shared hit=137 read=2
Planning Time: 2.497 ms
Execution Time: 0.323 ms
```

The composite index removed both the sequential scan and the explicit sort because
it locates one user's orders and stores them in descending creation-time order.
Execution time decreased from 5.846 ms to 0.323 ms, while touched data buffers
decreased from 1,623 to 7.

## Query 2: Latest Created Orders

The query returns the 100 most recent orders that have not yet been paid or
cancelled.

```sql
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
```

### Before Indexing

```text
Limit  (cost=3259.66..3259.91 rows=100 width=36) (actual time=20.271..20.300 rows=100 loops=1)
  Buffers: shared hit=1626
  ->  Sort  (cost=3259.66..3284.96 rows=10117 width=36) (actual time=20.270..20.273 rows=100 loops=1)
        Sort Key: created_at DESC
        Sort Method: top-N heapsort  Memory: 37kB
        Buffers: shared hit=1626
        ->  Seq Scan on orders  (cost=0.00..2873.00 rows=10117 width=36) (actual time=7.031..19.463 rows=10126 loops=1)
              Filter: (status = 'created'::text)
              Rows Removed by Filter: 89874
              Buffers: shared hit=1623
Planning:
  Buffers: shared hit=92
Planning Time: 1.870 ms
Execution Time: 20.380 ms
```

The sequential scan inspected all 100,000 orders, removed 89,874 rows and sorted
the remaining created orders before applying the limit.

### Index

```sql
CREATE INDEX idx_orders_created_created_at
ON orders (created_at DESC)
WHERE status = 'created';
```

### After Indexing

```text
Limit  (cost=0.29..66.77 rows=100 width=36) (actual time=0.165..4.127 rows=100 loops=1)
  Buffers: shared hit=100 read=2
  ->  Index Scan using idx_orders_created_created_at on orders  (cost=0.29..6695.25 rows=10070 width=36) (actual time=0.165..4.112 rows=100 loops=1)
        Buffers: shared hit=100 read=2
Planning:
  Buffers: shared hit=125
Planning Time: 1.215 ms
Execution Time: 4.187 ms
```

The partial index contains only created orders and already stores them in descending
creation-time order. This removed both the sequential scan and the sort. PostgreSQL
stopped after reading the first 100 index entries, reducing execution time from
20.380 ms to 4.187 ms and touched buffers from 1,626 to 102.

## Query 3: Case-Insensitive Product Search

The query finds a product by name without depending on the input letter case.

```sql
SELECT
    id,
    owner_id,
    name,
    price,
    available
FROM products
WHERE lower(name) = lower('PRODUCT 4242');
```

### Before Indexing

```text
Seq Scan on products  (cost=0.00..1416.00 rows=250 width=36) (actual time=1.645..14.998 rows=1 loops=1)
  Filter: (lower(name) = 'product 4242'::text)
  Rows Removed by Filter: 49999
  Buffers: shared hit=666
Planning:
  Buffers: shared hit=72
Planning Time: 1.323 ms
Execution Time: 15.057 ms
```

The sequential scan read all 50,000 products and evaluated `lower(name)` for every
row, removing 49,999 rows.

### Index

```sql
CREATE INDEX idx_products_lower_name
ON products (lower(name));
```

### After Indexing

```text
Index Scan using idx_products_lower_name on products  (cost=0.29..8.31 rows=1 width=36) (actual time=0.136..0.142 rows=1 loops=1)
  Index Cond: (lower(name) = 'product 4242'::text)
  Buffers: shared hit=1 read=2
Planning:
  Buffers: shared hit=96 read=1
Planning Time: 1.515 ms
Execution Time: 0.195 ms
```

The expression index changed the full scan into a direct lookup by the normalized
product name. Execution time decreased from 15.057 ms to 0.195 ms, while touched
data buffers decreased from 666 to 3.

## Summary

| Query                           | Before          | After                 | Execution time before | Execution time after |
| ------------------------------- | --------------- | --------------------- | --------------------: | -------------------: |
| Orders by user and date         | Seq Scan + Sort | Index Scan            |              5.846 ms |             0.323 ms |
| Latest created orders           | Seq Scan + Sort | Partial Index Scan    |             20.380 ms |             4.187 ms |
| Case-insensitive product search | Seq Scan        | Expression Index Scan |             15.057 ms |             0.195 ms |

The indexes were selected for the demonstrated queries only. No additional indexes
were added speculatively because every index consumes disk space and increases the
cost of insert and update operations.
