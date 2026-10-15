# Homelab de Tienda en Ubuntu Server

Pila independiente de `compose.yaml` local: Nginx → Nuxt SSR → NestJS → PostgreSQL 17.
Mailpit captura correos de prueba. Usa únicamente datos ficticios. No requiere
Node/pnpm en Ubuntu: las compilaciones se realizan dentro de Docker.

## 1. Preparar Ubuntu

Instala una versión de Ubuntu Server LTS con soporte y Docker Engine con el plugin
Compose siguiendo https://docs.docker.com/engine/install/ubuntu/. Instala además
`git`, `openssl`, `curl`, `python3` y `ca-certificates`. Habilita Docker al inicio:

```sh
sudo systemctl enable --now docker
```

Usa SSH con claves, un usuario administrador propio y acceso restringido a LAN/VPN.
Activa actualizaciones de seguridad; programa los reinicios fuera de las pruebas.
El grupo `docker` concede privilegios equivalentes a root: no agregues usuarios
sin confianza. Los servicios systemd de esta carpeta se ejecutan como root.

Recomendación inicial orientativa: 4 vCPU, 8 GB RAM y SSD con al menos 30 GB libres,
especialmente para compilar ambos proyectos. Comprueba la carga real antes de
reducir recursos; los límites de Compose corresponden a ejecución, no a build.

Clona ambos repositorios como carpetas hermanas:

```text
/opt/market/template-NestJS-backend
/opt/market/template-NuxtJS-frontend
```

Selecciona las ramas/revisiones compatibles en ambos. Esta implementación vive en
`feature/homelab-docker` hasta su integración. No copies `.env` ni la base del Mac.

## 2. Identidad, red y TLS

Desde el repositorio backend:

```sh
deploy/homelab/init.sh tienda.home.arpa
```

Crea una CA privada, certificado de servidor de 90 días y secretos aleatorios en
`deploy/homelab/private/` (ignorado por Git y excluido del build). No sobrescribe
configuraciones existentes. Protege esta carpeta y respalda su contenido de forma
cifrada fuera del servidor; `ca.key` permite emitir certificados confiables.
El certificado usa un nombre DNS: crea en tu DNS local o archivo hosts la entrada
`tienda.home.arpa → IP_LAN_DEL_SERVIDOR`.

Edita `private/homelab.env` sin compartirlo:

- Cambia `BIND_IP=127.0.0.1` por la IP LAN del servidor para acceder desde otros equipos.
- `PUBLIC_ORIGIN` debe coincidir exactamente con la URL HTTPS del navegador.
- Si cambias HTTPS a 8443, usa también `PUBLIC_ORIGIN=https://tienda.home.arpa:8443`.
- Si la subred `172.30.72.0/24` ya está usada, cambia `EDGE_SUBNET`, `NGINX_IP`
  y `FRONTEND_IP` juntos; usa IP distintas, libres y diferentes del gateway.
- Cambia `IMAGE_TAG` por una etiqueta de release común y registra también los dos
  commits. Conserva las imágenes de la versión anterior antes de actualizar.
- Las contraseñas generadas son hexadecimales, seguras para DATABASE_URL.
  No cambies `POSTGRES_PASSWORD` sobre un volumen existente sin rotar también la
  contraseña dentro de PostgreSQL. Cambiar solo el env no cambia la base.

Importa **solo `private/ca.crt`** al almacén de confianza de los dispositivos de
prueba. En Ubuntu cliente: copiar a `/usr/local/share/ca-certificates/tienda.crt` y
`sudo update-ca-certificates`. Otros sistemas/navegadores tienen su propio almacén.
No uses certificados ignorados por el navegador para validar las sesiones reales.
Para un dominio público, puedes sustituir `tls/server.crt` y `tls/server.key` por
certificado/cadena y clave emitidos para ese dominio; configura su renovación.
La renovación del certificado emitido por la CA privada se hace con `renew-tls.sh`; recarga Nginx y conserva
la misma CA. `check.sh` avisa si el certificado vence en menos de 14 días.

Solo se publican HTTP/HTTPS en la dirección configurada. Mailpit UI escucha en
`127.0.0.1:8026`, accesible con túnel SSH. Nuxt, backend, SMTP y PostgreSQL no tienen
puertos publicados. No abras puertos en el router para estas pruebas.

Docker puede eludir reglas habituales de UFW para puertos publicados; comprueba
los accesos desde otro equipo y restringe también en router/VLAN si corresponde:
https://docs.docker.com/engine/network/packet-filtering-firewalls/.

## 3. Construir y arrancar

```sh
deploy/homelab/compose.sh config --quiet
deploy/homelab/compose.sh build
deploy/homelab/compose.sh up -d --wait --wait-timeout 180
deploy/homelab/compose.sh ps
python3 deploy/homelab/smoke.py --origin https://tienda.home.arpa
```

No imprimas `compose config` sin `--quiet`: contiene valores privados. Los secretos
se inyectan en runtime desde el archivo protegido; no se hornean en las imágenes.
Usuarios con acceso a Docker/root pueden leerlos mediante inspect. Esta versión
no usa un gestor externo de secretos ni promete cifrado de secretos de Compose.

`smoke.py` verifica TLS con la CA, páginas públicas, catálogo y denegación de
rutas privadas sin crear datos. Usa `--connect-ip IP_SERVIDOR` para probar antes
de configurar DNS y ajusta `--origin` al puerto configurado.

El backend aplica migraciones antes de atender peticiones. La base tiene su
volumen propio `${COMPOSE_PROJECT_NAME}_postgres_data`. No usa el volumen local.
Nginx, Nuxt y NestJS se ejecutan sin root, con filesystem de solo lectura y /tmp
limitado. El procesamiento de imágenes puede usar caché temporal, perdida al
reiniciar. Los logs rotan a tres archivos de 10 MB por contenedor.

Crea el primer administrador con el script existente, dentro del backend:

```sh
deploy/homelab/compose.sh exec backend npm run admin:create
```

Consulta el procedimiento en el README principal. Usa la entrada interactiva
para la contraseña; no la escribas en historial o logs. No se ejecuta seed de
forma automática. Prueba login/logout, catálogo, venta, cobro, devolución y caja
con datos ficticios. El correo queda en Mailpit, no se envía a destinatarios reales:

```sh
ssh -L 8026:127.0.0.1:8026 usuario@IP_SERVIDOR
```

Luego abre http://localhost:8026. Restringe el acceso: contiene enlaces de
recuperación de contraseña y datos de prueba.

## 4. Backups, restauración y monitorización

```sh
deploy/homelab/backup.sh
deploy/homelab/verify-restore.sh
deploy/homelab/check.sh
```

`backup.sh` usa pg_dump custom, valida el archivo, guarda checksum y publica el
backup solo si termina correctamente. `verify-restore.sh [archivo]` restaura en
una base nueva con sufijo `_test`, comprueba la consulta de migraciones y la borra
al terminar. Nunca restaura sobre `tienda`. No equivale a una prueba de recuperación
de todo el servidor: realiza también un ensayo en otra VM con el backup y la
configuración privada. Los backups no incluyen secretos ni certificados.

Instala las unidades (ajusta las rutas si no usas `/opt/market`):

```sh
sudo cp deploy/homelab/systemd/tienda-* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now tienda-backup.timer tienda-check.timer tienda-restore-test.timer
sudo systemctl start tienda-backup.service
sudo systemctl start tienda-restore-test.service
sudo systemctl start tienda-check.service
# Solo si utilizas la CA privada generada (no con certificados externos):
sudo systemctl enable --now tienda-renew-tls.timer
sudo systemctl list-timers 'tienda-*'
```

Backup diario a las 03:00, restauración semanal el domingo a las 04:00 y
renovación TLS el día 1 de cada mes a las 04:30, según
la zona horaria de Ubuntu. Configura `America/La_Paz` si es la que necesitas.
La comprobación de salud corre cada cinco minutos y falla ante servicio no
saludable, disco >=85%, certificado próximo a vencer o ausencia de backup de las
últimas 48 horas. Revisa `systemctl --failed` y `journalctl -u tienda-check.service`.
Son diagnósticos locales: para recibir avisos configura el canal de alertas de tu
homelab para unidades fallidas. No hay notificaciones externas configuradas.

Copia los backups a otra máquina/NAS con permisos y cifrado adecuados. No hay
borrado automático de backups: configura retención después de verificar la copia
externa; vigila el espacio. Un snapshot de VM no sustituye la restauración probada.

## 5. Actualizar y recuperar

1. Confirma operaciones pendientes en navegadores antiguos antes del cambio.
2. Ejecuta backup y verificación de restauración.
3. Detén la entrada con `compose.sh stop nginx` para evitar escrituras nuevas.
4. Selecciona ambos commits revisados, configura una nueva etiqueta y construye.
5. `compose.sh up -d --wait --wait-timeout 180` aplica migraciones y arranca.
6. Comprueba `check.sh` y los flujos manuales antes de reabrir pruebas.

`restart: unless-stopped` reinicia los contenedores tras reboot si Docker está
habilitado. Los healthchecks detectan fallos, pero **no reinician automáticamente**
un proceso que sigue vivo y no saludable. Investiga sus logs.

Volver a una imagen anterior no revierte migraciones. Si hay un cambio incompatible,
mantén el servicio cerrado y sigue el procedimiento de restauración en otra base
antes de reconectar. Nunca uses `down -v`, reset o db push sobre datos conservados.

## Frontera de confianza de la IP

Nginx sobrescribe X-Real-IP y X-Forwarded-For con su conexión entrante, elimina
las afirmaciones HMAC del navegador y envía todas las rutas, incluido /api, a Nuxt.
Nuxt acepta X-Real-IP solo desde `NUXT_TRUSTED_PROXY_IP` (IP estática de Nginx) y
firma la IP para NestJS. No se activa trust proxy global. No pongas otro proxy
por delante sin revisar esta frontera: de lo contrario, los clientes compartirán
la IP del nuevo proxy. No hay caché de páginas, sesiones ni operaciones; los logs
de acceso omiten URL/query para no registrar tokens de recuperación.
