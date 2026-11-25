#!/usr/bin/env bash
set -euo pipefail

test_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

# Banco descartável sem publicação de portas, montagem do projeto ou rede externa.
container=$(docker run --detach --rm --network none \
  -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=nidovra_test postgres:18)
trap 'docker stop "$container" >/dev/null' EXIT

for ((attempt = 0; attempt < 30; attempt++)); do
  # A escuta TCP local só fica disponível após terminar a inicialização da imagem.
  if docker exec "$container" pg_isready -h 127.0.0.1 -U postgres -d nidovra_test >/dev/null 2>&1; then
    for migration in "$test_dir"/../migrations/*.sql; do
      docker exec -i "$container" psql -X -U postgres -d nidovra_test -v ON_ERROR_STOP=1 < "$migration"
    done
    docker exec -i "$container" psql -X -U postgres -d nidovra_test -v ON_ERROR_STOP=1 < "$test_dir/identity-schema.sql"
    exit 0
  fi
  sleep 1
done

printf '%s\n' 'PostgreSQL descartável não iniciou em 30 segundos.' >&2
exit 1
