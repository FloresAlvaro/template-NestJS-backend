#!/usr/bin/env python3
"""Read-only HTTPS/proxy smoke checks. Does not create users or business data."""
import argparse
from pathlib import Path
import subprocess
from urllib.parse import urlsplit

parser = argparse.ArgumentParser()
parser.add_argument('--origin', default='https://tienda.home.arpa')
parser.add_argument('--connect-ip', help='Override DNS only for these requests (for local testing).')
parser.add_argument('--ca', default=str(Path(__file__).parent / 'private/ca.crt'))
args = parser.parse_args()
url = urlsplit(args.origin)
if url.scheme != 'https' or not url.hostname or url.path or url.query or url.fragment or url.username:
    parser.error('--origin debe ser un origen HTTPS sin ruta ni credenciales')

for path, expected in [('/', 200), ('/login', 200), ('/shop', 200),
                       ('/api/health', 200), ('/api/shop/products', 200),
                       ('/api/auth/me', 401), ('/api/products', 401)]:
    cmd = ['curl', '--noproxy', '*', '--silent', '--show-error', '--max-time', '30',
           '--cacert', args.ca, '--write-out', '\n%{http_code}', args.origin + path]
    if args.connect_ip:
        cmd += ['--resolve', f'{url.hostname}:{url.port or 443}:{args.connect_ip}']
    result = subprocess.run(cmd, text=True, capture_output=True, check=True)
    body, status = result.stdout.rsplit('\n', 1)
    assert int(status) == expected, f'{path}: HTTP {status}, esperado {expected}'
    if path in ['/', '/login', '/shop']:
        assert 'No pudimos conectar con la tienda' not in body, f'{path}: API desconectada'
    print(f'{path}: HTTP {status}')
print('HTTPS confiable, SSR, catálogo público y protección de rutas: correctos.')
