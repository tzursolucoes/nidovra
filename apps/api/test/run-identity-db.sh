#!/usr/bin/env bash
set -euo pipefail

repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd)
export POSTGRES_PASSWORD
POSTGRES_PASSWORD=$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))")
container=$(docker run --detach --rm -p 127.0.0.1::5432 \
  -e POSTGRES_PASSWORD -e POSTGRES_DB=nidovra_test postgres:18)
trap 'docker stop "$container" >/dev/null' EXIT

for ((attempt = 0; attempt < 30; attempt++)); do
  if docker exec "$container" pg_isready -h 127.0.0.1 -U postgres -d nidovra_test >/dev/null 2>&1; then
    docker exec -i "$container" psql -X -U postgres -d nidovra_test -v ON_ERROR_STOP=1 \
      < "$repo/packages/db/migrations/001_identity.sql" >/dev/null
    docker exec -i "$container" psql -X -U postgres -d nidovra_test -v ON_ERROR_STOP=1 \
      < "$repo/packages/db/migrations/001a_identity_single_family.sql" >/dev/null
    address=$(docker port "$container" 5432/tcp)
    export NIDOVRA_DB_TEST_PORT=${address##*:}
    cd -- "$repo"
    pnpm exec vitest run apps/api/test/identity-db.test.ts
    exit 0
  fi
  sleep 1
done

printf '%s\n' 'PostgreSQL descartável não iniciou em 30 segundos.' >&2
exit 1
