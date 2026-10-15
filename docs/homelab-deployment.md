# Tienda en el home lab

Guía para un host **Ubuntu Server 24.04 LTS**, Docker Engine con Compose v2,
systemd y los dos repositorios como carpetas hermanas. Los comandos de esta guía
son Bash/Linux; no deben pegarse directamente en PowerShell. No se instala Node
en el host: ambas aplicaciones se compilan dentro de Docker para su arquitectura.

## 1. Arquitectura y alcance

```text
Navegador -- HTTPS :443 --> Caddy --> Nuxt :3000 --> /api proxy --> NestJS :3001 --> PostgreSQL :5432
                                                                |
                                                                +--> SMTP externo
```

Solo Caddy publica puertos. PostgreSQL, backend y frontend se comunican por la red
de Compose. Fotos, sesiones, inventario, ventas, auditoría y cola de correo están
en PostgreSQL. Los certificados/CA de Caddy usan un volumen persistente separado.
El Compose local del backend sigue siendo para desarrollo: esta guía usa
`deploy/homelab/compose.yaml`, con otro proyecto y otros volúmenes.

Los archivos entregados incluyen Compose, Caddyfile, `.env.example`, scripts de
backup/prueba de restauración y unidades systemd. El frontend incluye Dockerfile
multietapa y `.dockerignore`. No incluyen pasarela de pago ni facturación fiscal.
La API health verifica el proceso; no sustituye comprobar consultas reales a BD.

## 2. Preparar el servidor

Usa IP LAN fija o reserva DHCP, disco persistente y espacio para imágenes y copias.
Como punto inicial para pruebas, asigna 2 CPU y 4 GiB RAM; mide consumo durante el
build y aumenta recursos si es necesario. Configura hora/NTP y acceso SSH por clave.

Instala Docker Engine y el plugin Compose siguiendo la
[guía oficial para Ubuntu](https://docs.docker.com/engine/install/ubuntu/).
Comprueba y habilita el servicio:

```bash
sudo apt-get update
sudo apt-get install -y git openssl ca-certificates
sudo systemctl enable --now docker
sudo docker version
sudo docker compose version
sudo timedatectl set-timezone America/La_Paz
```

Los siguientes comandos Docker usan `sudo`; pertenecer al grupo docker también
concede control equivalente a root. No expongas el socket Docker por TCP.
Instala los repositorios bajo `/srv/tienda`, como usuario administrador del host:

```bash
sudo install -d -o "$USER" -g "$(id -gn)" /srv/tienda
cd /srv/tienda
git clone https://github.com/FloresAlvaro/template-NestJS-backend.git
git clone https://github.com/FloresAlvaro/template-NuxtJS-frontend.git
```

Elige revisiones que incluyan estos archivos y los módulos actuales. Mientras los
PR no estén integrados, las ramas de este trabajo son `docs/homelab-deployment`
(backend) y `fix/orders-navigation-homelab` (frontend); deben publicarse antes de
poder descargarlas en otro equipo. Después de integrarlas, usa la rama principal
y fija SHAs o tags de release. No despliegues el `master` antiguo sin estas piezas.

```text
/srv/tienda/
  template-NestJS-backend/
    deploy/homelab/
  template-NuxtJS-frontend/
    Dockerfile
```

## 3. DNS y HTTPS

### Opción A: LAN privada, configuración incluida

Asigna `tienda.home.arpa` a la IP LAN del servidor en el DNS de tu router/Pi-hole/
AdGuard, o en el archivo hosts de cada cliente. Mantén `tls internal` en Caddyfile.
No abras puertos en el router de Internet. Permite TCP 80/443 desde tu LAN/VPN;
SSH solamente desde la red de administración. Docker publica puertos mediante sus
reglas: verifica el acceso desde otro equipo, no dependas solo de UFW.

Caddy emite con su CA privada. Debes confiar en su certificado raíz en cada
dispositivo; el contenedor no lo instala automáticamente en los clientes.
Consulta [HTTPS automático de Caddy](https://caddyserver.com/docs/automatic-https).
Después del primer arranque extrae **solo el certificado público**:

```bash
cd /srv/tienda/template-NestJS-backend/deploy/homelab
sudo docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./tienda-root.crt
openssl x509 -in tienda-root.crt -noout -fingerprint -sha256
```

Distribúyelo por un canal de confianza y verifica la huella. En Ubuntu cliente:

```bash
sudo install -m 0644 tienda-root.crt /usr/local/share/ca-certificates/tienda-root.crt
sudo update-ca-certificates
```

En Windows cliente importa el `.crt` a Autoridades de certificación raíz de
confianza del usuario; Firefox puede necesitar su almacén propio. En móvil instala
el perfil/certificado y habilita confianza según el sistema. No distribuyas claves
privadas. Si pierdes el volumen de Caddy, restaura su CA desde backup para conservar
la confianza; generar otra exige reinstalar su raíz en todos los clientes.

### Opción B: dominio público y certificado ACME

Usa un dominio propio, por ejemplo `tienda.tudominio.com`, apunta A/AAAA a la IP
correcta y elimina `tls internal` del Caddyfile. Configura `TIENDA_HOST` y `BIND_IP`
en `.env`. Para este modo, los puertos TCP 80/443 deben llegar a Caddy desde
Internet; elimina AAAA si no tienes conectividad IPv6 válida. Caddy obtiene y
renueva certificados automáticamente. Conserva sus volúmenes entre actualizaciones.

Con CGNAT o sin acceso entrante, usa LAN/VPN con CA privada, o prepara otro diseño
con desafío DNS y módulo del proveedor; la imagen incluida no trae esos módulos.
Si ya hay un proxy usando 80/443, evita el conflicto: integra la tienda allí o
dedica otra IP/VM a este stack. No encadenes proxies sin revisar las URLs/orígenes.

Antes de abrir a Internet revisa `permissions-and-backlog.md`: quedan pendientes
el límite centralizado de autenticación, la política de stock público y la revisión
de dependencias. Este stack no convierte el limitador por proceso en uno por IP
del visitante; detrás de Nuxt varios clientes pueden compartir el límite.

## 4. Configuración y secretos

```bash
cd /srv/tienda/template-NestJS-backend/deploy/homelab
umask 077
cp .env.example .env
openssl rand -hex 32
nano .env
chmod 600 .env
```

Configura:

| Variable | Valor |
| --- | --- |
| `TIENDA_HOST` | Nombre DNS, sin esquema, ruta ni barra final |
| `BIND_IP` | IP LAN real del host; el ejemplo `127.0.0.1` solo acepta acceso local |
| `POSTGRES_PASSWORD` | Resultado hexadecimal aleatorio del comando anterior |
| `APP_TAG` | Identificador de release; usa un valor nuevo en cada actualización |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | Proveedor SMTP y remitente autorizado |
| `SMTP_PORT`, `SMTP_SECURE`, `SMTP_REQUIRE_TLS` | Normalmente 587/false/true; para TLS implícito 465/true/true |
| `ORDER_RESERVATION_MINUTES` | 1 a 10080; predeterminado 1440 |
| `ORDER_NOTIFICATIONS_ENABLED` | `true` para enviar la cola de avisos |

El password PostgreSQL hexadecimal evita escape adicional dentro de DATABASE_URL.
Para valores SMTP con `$`, `#` o espacios usa comillas simples en `.env` y las reglas
de escape de Compose; no lo cargues con `source`. No publiques `.env` ni salidas de
`docker compose config` completas: pueden contener contraseñas. Usa `config --quiet`.
Cambiar POSTGRES_PASSWORD en un volumen existente no cambia la clave de PostgreSQL;
una rotación requiere alterar el rol y coordinar la conexión, no reinicializar datos.

Compose establece `COOKIE_SECURE=true`, origen HTTPS exacto y URL de recuperación.
Nuxt usa `http://backend:3001/api` solo dentro de Docker. El navegador sigue usando
`/api` del mismo origen HTTPS. Mailpit no está incluido: no entrega correo real.
Si usas SMTP local, configura un relay accesible desde la red Docker; `localhost`
dentro del backend apunta al propio contenedor.

## 5. Compilar, iniciar y crear administrador

```bash
sudo docker compose config --quiet
sudo docker compose build --pull
sudo docker compose run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo docker compose up -d --wait
sudo docker compose ps
sudo docker compose logs --tail=100 backend frontend caddy
sudo docker compose exec backend node scripts/create-admin.cjs
```

El arranque del backend aplica migraciones antes de servir. La creación del primer
ADMIN es interactiva y rechaza reemplazar uno existente. No ejecutes seeds/demo
automáticamente en una tienda con datos reales. Para cargar catálogo, usa la UI y
registra stock inicial mediante movimientos de inventario.

Comprueba desde otro dispositivo: resolución DNS, confianza del certificado,
redirección HTTP a HTTPS, catálogo, login, fotos, inventario y una consulta real.
Prueba recuperación de contraseña y avisos con una cuenta propia de prueba; valida
entrega SMTP. Verifica cookie HttpOnly/Secure y que un CUSTOMER no acceda a gestión.
Usa datos aislados para ventas/cobros/stock. Health y SMTP aceptado no garantizan
disponibilidad de BD ni entrega del correo a la bandeja del destinatario.

```bash
curl --cacert tienda-root.crt https://tienda.home.arpa/api/health
sudo docker compose exec db psql -U tienda -d tienda -c 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;'
```

Con ACME público no necesitas `--cacert`. No uses `curl -k` como comprobación de TLS.
Swagger del backend no se publica directamente: Caddy solo reenvía a Nuxt. No añadas
un puerto público para NestJS o PostgreSQL para solucionar problemas de conexión.

## 6. Arranque automático

Las unidades incluidas asumen exactamente `/srv/tienda`; edítalas si cambias la ruta.
Comprueba que `/usr/bin/docker` sea el binario instalado. Como estos archivos y
`.env` se ejecutan con root, deja el directorio de despliegue escribible solo por
administradores de confianza.

```bash
cd /srv/tienda/template-NestJS-backend/deploy/homelab
sudo install -m 0644 tienda.service /etc/systemd/system/tienda.service
sudo install -m 0644 tienda-backup.service /etc/systemd/system/tienda-backup.service
sudo install -m 0644 tienda-backup.timer /etc/systemd/system/tienda-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now tienda.service
sudo systemctl enable --now tienda-backup.timer
sudo systemctl status tienda.service --no-pager
sudo systemctl list-timers tienda-backup.timer
```

Docker arranca al encender Linux; systemd levanta el stack y los contenedores usan
`restart: unless-stopped`. La unidad no compila imágenes al arrancar: haz el build
antes. Programa un reinicio de prueba y confirma acceso y timer al volver. Para
detener deliberadamente usa `sudo systemctl stop tienda.service`; para arrancar
otra vez `sudo systemctl start tienda.service`. No uses `down -v` sobre esta tienda.
Un estado `unhealthy` por sí solo no reinicia el proceso; supervisa salud y disco.

## 7. Backups diarios y copia fuera del host

`backup.sh` crea `/var/backups/tienda/FECHA_UTC/` con:

- `database.dump`: pg_dump formato custom, snapshot consistente con la tienda activa.
- `database.list`: índice legible del dump.
- `deployment.tar.gz`: configuración, secretos y unidades/scripts de despliegue.
- `caddy-data.tar.gz`: certificados y CA privada, para recuperar confianza HTTPS.
- `versions.txt` y `SHA256SUMS`: revisiones Git, imágenes y comprobación de integridad.

Los directorios `.partial-*` indican fallo; no sirven como copia terminada. El
script bloquea ejecuciones simultáneas, usa permisos privados y falla si una fase
falla. La copia de Caddy es auxiliar, no un snapshot atómico del volumen: valida
TLS al restaurarla. El dump incluye imágenes almacenadas en PostgreSQL, pero no
historial WAL ni recuperación a un segundo exacto. Ver
[pg_dump de PostgreSQL 17](https://www.postgresql.org/docs/17/app-pgdump.html).

```bash
sudo bash backup.sh
sudo systemctl start tienda-backup.service
sudo journalctl -u tienda-backup.service -n 50 --no-pager
sudo ls -lh /var/backups/tienda
```

El timer ejecuta a las 03:00 America/La_Paz con hasta 5 minutos de dispersión y
recupera una ejecución perdida cuando el host vuelve. Alerta por fallo de la unidad,
última copia con más de 26 horas y espacio libre bajo. No hay borrado automático:
debes establecer retención según disco y requisitos.

Para pérdida de servidor/disco, **la copia local no alcanza**. Una opción es restic
con repositorio cifrado en un NAS por SFTP. Instala restic según su distribución,
configura acceso SSH con clave y host key verificada, y un archivo root-only
`/etc/tienda-restic.env` con `RESTIC_REPOSITORY=sftp:usuario@nas:/ruta/tienda` y
`RESTIC_PASSWORD_FILE=/etc/tienda-restic-password`. Genera una contraseña fuerte,
guárdala fuera del host y no la añadas a Git. Inicializa una sola vez:

```bash
sudo bash -c 'set -a; source /etc/tienda-restic.env; set +a; restic init'
```

Para copiar automáticamente después de cada backup local:

```bash
sudo systemctl edit tienda-backup.service
```

Añade el drop-in:

```ini
[Service]
EnvironmentFile=/etc/tienda-restic.env
ExecStartPost=/usr/bin/restic backup /var/backups/tienda --exclude=/var/backups/tienda/.partial-* --tag tienda
```

```bash
sudo systemctl daemon-reload
sudo systemctl start tienda-backup.service
sudo bash -c 'set -a; source /etc/tienda-restic.env; set +a; restic snapshots; restic check'
```

Comprueba la ruta de restic con `command -v restic` y ajusta la unidad. El archivo
de entorno es de confianza y propiedad de root. Guarda también ese drop-in,
configuración/clave de restic y acceso SSH en el gestor seguro de recuperación;
no están dentro de deployment.tar.gz. Política inicial: 7 diarios, 4 semanales y
6 mensuales. Tras confirmar copias remotas y una restauración, aplica al repositorio
dedicado `restic forget --tag tienda --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune`.
Limpia manualmente copias locales antiguas verificando rutas, fechas y copia remota;
conserva al menos 7 diarias. `restic check` y SHA256 no sustituyen restaurar.

Objetivo inicial: perder como máximo un día de datos (RPO aproximado 24 h si las
copias se completan) y recuperar en pocas horas; mide el RTO con un ensayo real.

## 8. Ensayo de restauración sin tocar producción

Ejecuta al instalar, después de cambiar el esquema y al menos mensualmente:

```bash
cd /srv/tienda/template-NestJS-backend/deploy/homelab
sudo bash restore-test.sh /var/backups/tienda/FECHA_UTC
```

El script verifica checksums, arranca `restore-db` (sin puerto publicado), exige
`tienda_restore` vacía y restaura en una transacción. No ejecuta backend/worker
contra esa copia y no modifica `db`. Comprueba los conteos mostrados y revisa
ventas recientes, imágenes, stock y migraciones mediante consultas de lectura.
Para validar UI y login, levanta todo el stack en otra VM/proyecto, con su propio
DNS/CA, SMTP de pruebas, `ORDER_NOTIFICATIONS_ENABLED=false` y ninguna conexión a
producción; usa el procedimiento del apartado siguiente. Así evitas reenvíos de
avisos históricos o correos reales durante el ensayo.

Para repetir el ensayo puedes crear otra VM/proyecto, o vaciar **solo la base de
prueba**, después de revisar que estos comandos apuntan a `restore-db`:

```bash
sudo docker compose --profile restore exec -T restore-db dropdb -U tienda --if-exists tienda_restore
sudo docker compose --profile restore exec -T restore-db createdb -U tienda -O tienda tienda_restore
sudo bash restore-test.sh /var/backups/tienda/FECHA_UTC
sudo docker compose --profile restore stop restore-db
```

No uses `down -v` para limpiar el ensayo: eliminaría también volúmenes de la tienda.
Ver [pg_restore de PostgreSQL 17](https://www.postgresql.org/docs/17/app-pgrestore.html).

## 9. Recuperación completa en un host nuevo

1. Instala Docker, descarga ambos repositorios y recupera las revisiones de
   `versions.txt`. Conserva las imágenes de cada release en un registro privado o
   con `docker image save`; los tags base son mutables y Git no guarda binarios.
2. Copia el backup a un directorio privado. Si lo recuperas desde restic usa
   `restic snapshots` y `restic restore ID --target /srv/recuperacion` con sus
   credenciales; el backup estará bajo `var/backups/tienda/FECHA_UTC` dentro del destino.
3. Verifica `sha256sum -c SHA256SUMS` desde la carpeta recuperada. Extrae
   `deployment.tar.gz` en `deploy/homelab` con `umask 077`, revisa `.env`, rutas,
   Caddyfile, IP, SMTP y release. No ejecutes scripts de archivos no confiables.
4. En ese host/proyecto nuevo, todavía sin backend ni Caddy atendiendo usuarios:

```bash
cd /srv/tienda/template-NestJS-backend/deploy/homelab
sudo docker compose config --quiet
sudo docker compose build
sudo docker compose up -d --wait db
sudo docker compose exec -T db psql -U tienda -d tienda -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"
# Debe devolver 0. Si no está vacío, detente: no sobrescribas datos.
sudo docker compose exec -T db pg_restore -U tienda -d tienda --no-owner --no-privileges --exit-on-error --single-transaction < /RUTA/AL/BACKUP/database.dump
# Crea el volumen Caddy sin iniciar el proxy; restaura solo en un volumen nuevo.
sudo docker compose run --rm --no-deps -T --entrypoint sh caddy -c 'tar -C /data -xzf -' < /RUTA/AL/BACKUP/caddy-data.tar.gz
sudo docker compose up -d --wait
```

5. Revisa logs, migraciones, acceso HTTPS, usuarios, fotos, operaciones recientes y
   correo. Habilita systemd y timer, haz una nueva copia y solo entonces cambia DNS
   o el router al servidor recuperado. Mantén el anterior apagado/aislado para no
   aceptar escrituras ni enviar la misma cola desde dos instalaciones.

Un dump antiguo conserva sesiones y tokens de ese momento. Ante incidente de
seguridad define revocación de sesiones y rotación de secretos antes de reabrir.
No restaures directamente encima de una BD con datos: usa una instancia vacía y
realiza un cambio de servicio planificado. Para volver atrás conserva el host/volumen
anterior intacto; cualquier escritura posterior al backup debe reconciliarse.

## 10. Actualización y diagnóstico

Antes de actualizar: backup correcto, ensayo reciente y SHAs/imágenes anteriores
registrados. Revisa las migraciones y programa una ventana; detén la unidad, cambia
ambos checkouts a las revisiones compatibles, actualiza APP_TAG, compila e inicia:

```bash
sudo systemctl stop tienda.service
# git fetch y git switch --detach SHA en cada repositorio; edita APP_TAG en .env.
sudo docker compose build --pull
sudo systemctl start tienda.service
sudo docker compose ps
sudo docker compose logs --tail=100 backend frontend caddy
```

Para volver atrás no basta con una imagen antigua si cambió el esquema. Prueba la
compatibilidad o recupera el dump anterior en una instancia nueva, documentando
las operaciones posteriores que se perderían. Nunca ejecutes migrate reset.

| Síntoma | Revisar |
| --- | --- |
| 502/503 | Logs y health de frontend/backend; destino privado `backend:3001/api` |
| Login 403 | Origin exacto HTTPS, TIENDA_HOST y DNS; no desactivar la protección |
| No persiste sesión | HTTPS real y cookie Secure; abrir siempre con el DNS elegido |
| Certificado no confiable | CA instalada, huella, nombre DNS y reloj del cliente |
| ACME falla | A/AAAA, CGNAT, puertos 80/443 y logs Caddy |
| Migración falla | Logs backend, BD accesible y revisión compatible; conservar volúmenes |
| Correos no llegan | SMTP/TLS/remitente, avisos ADMIN y rechazo del proveedor |
| Backup falla | `journalctl -u tienda-backup.service`, disco, PostgreSQL y Caddy activos |

Revisa periódicamente uso de disco (`df -h`, `docker system df`), espacio en NAS,
logs, certificados, parches del host, dependencias e imágenes. No ejecutes prune
de volúmenes ni limpiezas indiscriminadas. El reinicio automático y el backup no
sustituyen monitoreo, pruebas de restauración y una copia fuera del servidor.

## Validación de estos archivos

Revisión del 15/10/2026: Compose válido con el perfil normal y el de restauración,
sintaxis Bash correcta en ambos scripts, rutas de build resueltas a los dos
repositorios y secretos/copias excluidos de Git y del contexto de build backend.
La versión fijada de pnpm existe en el registro npm. Los ejemplos se contrastaron
con el código y los contratos actuales.

No se ejecutaron build Docker, emisión TLS, reinicio del servidor ni restauración
real: Docker no estaba en ejecución en el entorno de edición. Completa esos
ensayos en el home lab antes de confiar datos reales a este despliegue.
