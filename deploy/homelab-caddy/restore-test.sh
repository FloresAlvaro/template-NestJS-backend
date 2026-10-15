#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
if [[ $# != 1 ]]; then echo "Uso: bash $0 /var/backups/tienda-caddy/FECHA" >&2; exit 1; fi
backup=$(realpath -- "$1")
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
dc=(docker compose --env-file .env -f compose.yaml --profile restore)
mkdir -p /var/backups/tienda-caddy
exec 9>/var/backups/tienda-caddy/.restore-test.lock
flock -n 9 || { echo 'Ya hay una restauración de prueba en ejecución.' >&2; exit 1; }
(cd -- "$backup" && sha256sum -c SHA256SUMS)
"${dc[@]}" up -d --wait restore-db
tables=$("${dc[@]}" exec -T restore-db psql -U tienda -d tienda_restore -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
if [[ "$tables" != 0 ]]; then
  echo 'tienda_restore contiene tablas. Se conserva intacta. Sigue la guía para preparar otra prueba.' >&2
  exit 1
fi
"${dc[@]}" exec -T restore-db pg_restore -U tienda -d tienda_restore --no-owner --no-privileges --exit-on-error --single-transaction < "$backup/database.dump"
"${dc[@]}" exec -T restore-db psql -U tienda -d tienda_restore -v ON_ERROR_STOP=1 -c 'SELECT count(*) AS users FROM "User"; SELECT count(*) AS products FROM "Product"; SELECT count(*) AS sales FROM "Sale"; SELECT count(*) AS migrations FROM "_prisma_migrations";'
echo 'Restauración SQL completada en tienda_restore. Producción no se ha modificado.'
echo 'Completa la revisión funcional indicada en la guía. Después: docker compose --profile restore stop restore-db'
