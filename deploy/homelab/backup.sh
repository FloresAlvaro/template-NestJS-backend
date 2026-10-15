#!/bin/sh
set -eu
cd "$(dirname "$0")"
umask 077
mkdir -p private/backups
stamp=$(date -u +%Y%m%dT%H%M%SZ)
file="private/backups/tienda-$stamp-$$.dump"
trap 'rm -f "$file.tmp"' EXIT HUP INT TERM
./compose.sh exec -T db sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$file.tmp"
# Reject an empty/corrupt archive before publishing it as a successful backup.
./compose.sh exec -T db pg_restore --list < "$file.tmp" >/dev/null
mv "$file.tmp" "$file"
if command -v sha256sum >/dev/null; then sha256sum "$file" > "$file.sha256"; else shasum -a 256 "$file" > "$file.sha256"; fi
printf 'Backup completado: %s\n' "$file"
# Retention is intentionally manual until an off-host copy is configured.
