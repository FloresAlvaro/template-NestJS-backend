#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
dc=(docker compose --env-file .env -f compose.yaml)
root=/var/backups/tienda-caddy
mkdir -p -- "$root"
exec 9>"$root/.backup.lock"
flock -n 9 || { echo 'Ya hay un backup en ejecución.' >&2; exit 1; }
stamp=$(date -u +%Y%m%dT%H%M%S%NZ)
partial="$root/.partial-$stamp"
mkdir -- "$partial"
# Los fallos conservan .partial para diagnóstico; nunca se anuncian como backup válido.
"${dc[@]}" exec -T db pg_dump -U tienda -d tienda -Fc > "$partial/database.dump"
"${dc[@]}" exec -T db pg_restore --list < "$partial/database.dump" > "$partial/database.list"
tar -czf "$partial/deployment.tar.gz" .env compose.yaml Caddyfile backup.sh restore-test.sh tienda-caddy.service tienda-caddy-backup.service tienda-caddy-backup.timer
"${dc[@]}" exec -T caddy tar -C /data -czf - . > "$partial/caddy-data.tar.gz"
{
  printf 'UTC: %s\n' "$stamp"
  printf 'Backend: '; git -C ../.. rev-parse HEAD
  printf 'Frontend: '; git -C ../../../template-NuxtJS-frontend rev-parse HEAD
  "${dc[@]}" images
} > "$partial/versions.txt"
(
  cd -- "$partial"
  sha256sum database.dump database.list deployment.tar.gz caddy-data.tar.gz versions.txt > SHA256SUMS
)
mv -- "$partial" "$root/$stamp"
printf 'Backup completo: %s/%s\n' "$root" "$stamp"
