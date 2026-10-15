#!/bin/sh
set -eu
cd "$(dirname "$0")"
umask 077
host=$(sed -n 's|^PUBLIC_ORIGIN=https://\([^:/]*\).*$|\1|p' private/homelab.env)
case "$host" in *[!a-zA-Z0-9.-]*|'') echo 'PUBLIC_ORIGIN debe usar un nombre DNS HTTPS.' >&2; exit 1;; esac
trap 'rm -f private/renew.csr private/renew.ext private/renew.crt' EXIT HUP INT TERM
openssl req -new -sha256 -key private/tls/server.key -subj "/CN=$host" -out private/renew.csr
printf 'subjectAltName=DNS:%s\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n' "$host" > private/renew.ext
openssl x509 -req -sha256 -days 90 -in private/renew.csr -CA private/ca.crt -CAkey private/ca.key \
  -CAcreateserial -extfile private/renew.ext -out private/renew.crt
chmod 644 private/renew.crt
mv private/renew.crt private/tls/server.crt
./compose.sh exec -T nginx nginx -c /tmp/nginx.conf -t
./compose.sh exec -T nginx nginx -c /tmp/nginx.conf -s reload
