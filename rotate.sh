#!/usr/bin/env bash

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

SECRET_FILE="secrets/db_password"
TEMP_FILE="${SECRET_FILE}.tmp"
NEW_PASSWORD="marketplace-$(openssl rand -hex 12)"

cleanup() {
  rm -f "${TEMP_FILE}"
}

trap cleanup EXIT

echo "1. Changing password in Postgres..."

docker compose exec -T db \
  psql -U admin -d marketplace \
  -v ON_ERROR_STOP=1 \
  -c "ALTER ROLE app_user WITH PASSWORD '${NEW_PASSWORD}';" \
  >/dev/null

echo "2. Updating the secret file..."

printf '%s' "${NEW_PASSWORD}" > "${TEMP_FILE}"
mv "${TEMP_FILE}" "${SECRET_FILE}"

echo "3. Closing old app_user connections..."

docker compose exec -T db \
  psql -U admin -d marketplace \
  -v ON_ERROR_STOP=1 \
  -tA \
  -c "
    SELECT count(pg_terminate_backend(pid))
    FROM pg_stat_activity
    WHERE usename = 'app_user';
  "

echo "Password rotation completed. The application was not restarted."
