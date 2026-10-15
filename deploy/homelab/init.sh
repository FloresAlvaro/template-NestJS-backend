#!/bin/sh
set -eu
cd "$(dirname "$0")"
umask 077
host=${1:-tienda.home.arpa}
case "$host" in
  *[!a-zA-Z0-9.-]*|'') echo 'Usa un nombre DNS sin esquema, puerto ni espacios.' >&2; exit 1;;
esac
if [ -e private/homelab.env ] || [ -e private/tls ]; then
  echo 'La configuración privada ya existe; no se sobrescribe.' >&2
  exit 1
fi
command -v openssl >/dev/null
mkdir -p private/tls private/backups
chmod 700 private
# The private parent protects these files on the host; nginx UID 101 must read
# the bind-mounted tls directory. Never mount the parent or CA key into nginx.
chmod 755 private/tls
openssl req -x509 -newkey rsa:3072 -nodes -sha256 -days 3650 \
  -addext 'basicConstraints=critical,CA:TRUE' -addext 'keyUsage=critical,keyCertSign,cRLSign' \
  -subj '/CN=Tienda Homelab CA' -keyout private/ca.key -out private/ca.crt >/dev/null 2>&1
openssl req -newkey rsa:2048 -nodes -sha256 -subj "/CN=$host" \
  -keyout private/tls/server.key -out private/server.csr >/dev/null 2>&1
printf 'subjectAltName=DNS:%s\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n' "$host" > private/server.ext
openssl x509 -req -sha256 -days 90 -in private/server.csr -CA private/ca.crt \
  -CAkey private/ca.key -CAcreateserial -extfile private/server.ext -out private/tls/server.crt >/dev/null 2>&1
chmod 644 private/tls/server.key private/tls/server.crt private/ca.crt
cat > private/homelab.env <<ENV
COMPOSE_PROJECT_NAME=tienda-homelab
PUBLIC_ORIGIN=https://$host
# Change to the Ubuntu server LAN IP to allow LAN access; no router forwarding.
BIND_IP=127.0.0.1
HTTP_PORT=80
HTTPS_PORT=443
MAILPIT_PORT=8026
EDGE_SUBNET=172.30.72.0/24
NGINX_IP=172.30.72.2
FRONTEND_IP=172.30.72.3
IMAGE_TAG=homelab
POSTGRES_PASSWORD=$(openssl rand -hex 32)
AUTH_PROXY_SECRET=$(openssl rand -hex 32)
ENV
chmod 600 private/homelab.env private/ca.key
rm private/server.csr private/server.ext
printf 'Configuración creada para https://%s. Configura DNS, BIND_IP y confianza en private/ca.crt antes de iniciar.\n' "$host"
