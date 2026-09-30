#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENV_SLUG="${1:-dev}"
if [ "$#" -gt 0 ]; then
  shift
fi

[ "$#" -gt 0 ] || set -- pnpm start

# CI and grading provide configuration through the environment.
if [ "${SKIP_VAULT:-0}" = "1" ]; then
  exec "$@"
fi

exec infisical run --env="$ENV_SLUG" -- "$@"
