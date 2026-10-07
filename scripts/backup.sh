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

timestamp="$(date '+%Y-%m-%d_%H-%M-%S')"
backup_path="$BACKUP_DIR/marketplace_${timestamp}.dump"
temporary_path="${backup_path}.tmp"

mkdir -p "$BACKUP_DIR"
trap 'rm -f "$temporary_path"' EXIT

docker compose -f "$ROOT/docker-compose.yml" exec -T db \
  pg_dump --username=backup_user --dbname="$database_name" \
  --format=custom --no-owner --no-privileges \
  > "$temporary_path"

docker compose -f "$ROOT/docker-compose.yml" exec -T db \
  pg_restore --list < "$temporary_path" > /dev/null

mv "$temporary_path" "$backup_path"
trap - EXIT

echo "Backup created: $backup_path"
