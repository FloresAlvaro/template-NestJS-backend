#!/bin/sh
set -eu
cd "$(dirname "$0")"
./compose.sh ps --all
for service in db mailpit backend frontend nginx; do
  id=$(./compose.sh ps -q "$service")
  [ -n "$id" ] || { echo "Falta servicio: $service" >&2; exit 1; }
  state=$(docker inspect --format '{{.State.Health.Status}}' "$id")
  [ "$state" = healthy ] || { echo "$service: $state" >&2; exit 1; }
done
openssl x509 -checkend 1209600 -noout -in private/tls/server.crt
# Require a successful backup from the last 48 hours.
recent=$(find private/backups -name '*.dump' -type f -mmin -2880 -print -quit)
[ -n "$recent" ] || { echo 'No existe backup reciente (48 horas).' >&2; exit 1; }
used=$(df -P private | awk 'NR==2 {gsub(/%/,"",$5); print $5}')
[ "$used" -lt 85 ] || { echo 'Disco con ocupación >=85%.' >&2; exit 1; }
echo 'Servicios, certificado, backup reciente y espacio: correctos.'
