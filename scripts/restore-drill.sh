#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"

# DATABASE_URL is injected by scripts/with-secrets.sh or by the grader.
: "${DATABASE_URL}"

database_url_without_query="${DATABASE_URL%%\?*}"
database_name="${database_url_without_query##*/}"

if [ -z "$database_name" ]; then
  echo 'DATABASE_URL must contain a database name' >&2
  exit 1
fi

if [ ! -d "$BACKUP_DIR" ]; then
  echo "No backup found in $BACKUP_DIR" >&2
  exit 1
fi

latest_backup="$(find "$BACKUP_DIR" -type f -name '*.dump' -print 2>/dev/null | sort | tail -n 1)"

if [ -z "$latest_backup" ] || [ ! -f "$latest_backup" ]; then
  echo "No backup found in $BACKUP_DIR" >&2
  exit 1
fi

checksum_sql="SELECT count(*)::text || '|' || COALESCE(sum(id), 0)::text FROM public.orders;"
source_checksum="$(
  docker compose -f "$ROOT/docker-compose.yml" exec -T db \
    psql --username=backup_user --dbname="$database_name" --tuples-only --no-align \
    --command="$checksum_sql"
)"

run_id="$(date '+%Y%m%d%H%M%S')-$$"
container_name="marketplace-restore-drill-$run_id"
volume_name="marketplace-restore-drill-$run_id"

cleanup() {
  docker rm --force "$container_name" > /dev/null 2>&1 || true
  docker volume rm "$volume_name" > /dev/null 2>&1 || true
}

trap cleanup EXIT
start_ms="$(node -e 'process.stdout.write(String(Date.now()))')"

docker volume create "$volume_name" > /dev/null
docker run --detach \
  --name "$container_name" \
  --mount "type=volume,source=$volume_name,target=/var/lib/postgresql/data" \
  --env POSTGRES_USER=restore_admin \
  --env POSTGRES_DB=restore_drill \
  --env POSTGRES_HOST_AUTH_METHOD=trust \
  postgres:17-alpine > /dev/null

database_ready=0
for _ in $(seq 1 60); do
  if docker exec "$container_name" pg_isready \
    --username=restore_admin --dbname=restore_drill > /dev/null 2>&1; then
    database_ready=1
    break
  fi

  sleep 1
done

if [ "$database_ready" -ne 1 ]; then
  echo 'Restore database did not become ready' >&2
  exit 1
fi

docker exec --interactive "$container_name" \
  pg_restore --username=restore_admin --dbname=restore_drill \
  --no-owner --no-privileges --exit-on-error \
  < "$latest_backup"

restored_checksum="$(
  docker exec "$container_name" \
    psql --username=restore_admin --dbname=restore_drill --tuples-only --no-align \
    --command="$checksum_sql"
)"

finish_ms="$(node -e 'process.stdout.write(String(Date.now()))')"
restore_time_ms="$((finish_ms - start_ms))"
backup_size_bytes="$(wc -c < "$latest_backup" | tr -d ' ')"

echo "Backup: $latest_backup"
echo "Backup size: $backup_size_bytes bytes"
echo "Source checksum: $source_checksum"
echo "Restored checksum: $restored_checksum"
echo "Measured RTO: $restore_time_ms ms"

if [ "$source_checksum" != "$restored_checksum" ]; then
  echo 'MISMATCH' >&2
  exit 1
fi

echo 'MATCH'
