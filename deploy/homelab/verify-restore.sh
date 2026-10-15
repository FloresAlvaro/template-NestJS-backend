#!/bin/sh
set -eu
cd "$(dirname "$0")"
file=${1:-$(find private/backups -name '*.dump' -type f | sort | tail -n 1)}
[ -s "$file" ] || { echo 'Backup inexistente o vacío.' >&2; exit 1; }
# Only a new disposable database ending in _test can be restored here.
db="homelab_restore_$$_test"
./compose.sh exec -T db createdb -U tienda "$db"
trap './compose.sh exec -T db dropdb -U tienda --if-exists "$db"' EXIT HUP INT TERM
./compose.sh exec -T db pg_restore --exit-on-error --no-owner --no-privileges -U tienda -d "$db" < "$file"
./compose.sh exec -T db psql -v ON_ERROR_STOP=1 -U tienda -d "$db" -Atc \
  'SELECT count(*) AS applied_migrations FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL'
printf 'Restauración verificada en %s; la base habitual no se modificó.\n' "$db"
