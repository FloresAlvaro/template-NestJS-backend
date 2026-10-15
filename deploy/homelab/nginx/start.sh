#!/bin/sh
set -eu
# Replace only this setting, preserving nginx's own $variables.
envsubst '${PUBLIC_ORIGIN}' < /etc/nginx/nginx.conf.template > /tmp/nginx.conf
exec nginx -c /tmp/nginx.conf -g 'daemon off;'
