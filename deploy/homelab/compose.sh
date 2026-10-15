#!/bin/sh
set -eu
cd "$(dirname "$0")"
if [ ! -f private/homelab.env ]; then
  echo 'Ejecuta deploy/homelab/init.sh antes de usar el homelab.' >&2
  exit 1
fi
exec docker compose --env-file private/homelab.env -f compose.yaml "$@"
