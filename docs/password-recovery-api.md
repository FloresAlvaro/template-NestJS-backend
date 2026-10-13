# Recuperación de contraseña local

Ver [flujo de solicitud](flowcharts.md#4-solicitar-recuperación-de-contraseña),
[flujo de confirmación](flowcharts.md#5-confirmar-una-nueva-contraseña),
[UML de usuarios y sesiones](diagrams/uml-classes.md#usuarios-sesiones)
y el [índice de diagramas](diagrams/README.md).

Implementada con SMTP mediante Nodemailer y Mailpit 1.31.5. Mailpit captura los
correos en localhost; no entrega mensajes a direcciones reales ni requiere cuenta
de correo o dominio. No hay relay externo configurado.

## Prueba manual

Con Docker Desktop activo, ejecuta `docker compose up -d --build backend`.
El arranque aplica migraciones y levanta Mailpit; PostgreSQL conserva su volumen.

1. Abre http://localhost:3001/api/auth/reset-password.
2. Escribe el correo de una cuenta activa que ya exista en la tienda.
3. Abre http://localhost:8025 y busca el mensaje de recuperación.
4. Abre el enlace y establece una contraseña de 12 a 128 caracteres.
5. Inicia sesión con la nueva contraseña. Las sesiones anteriores se revocan;
   la recuperación no inicia sesión automáticamente.

El formulario lo sirve el backend; la integración en Nuxt sigue pendiente.
Los mensajes de Mailpit son temporales y se limitan a 100; sus puertos web y SMTP
solo se publican en 127.0.0.1.

Para Node fuera de Docker, inicia `docker compose up -d mailpit` y añade a tu
`.env` las variables SMTP de `.env.example`, con host `127.0.0.1` y puerto 1025.
No reemplaces DATABASE_URL. Compose usa `mailpit:1025` dentro de su red.

## Contrato

Rutas públicas; las escrituras mantienen Origin autorizado y validación global:

- `POST /api/auth/forgot-password`, body `{ "email": "cliente@example.test" }`.
  Normaliza el correo a minúsculas y responde 200 con el mismo mensaje para
  cuentas activas, inexistentes o inactivas. No devuelve tokens ni usuarios.
- `POST /api/auth/reset-password`, body `{ "token": "64 caracteres hexadecimales", "newPassword": "12 a 128 caracteres" }`.
  Responde 200 `{ "success": true }` y limpia la cookie de sesión. Token inválido,
  caducado, utilizado o usuario inactivo devuelve 400.
- `GET /api/auth/reset-password`: formulario HTML independiente.

Origin ausente o ajeno devuelve 403. Campos extra o inválidos devuelven 400.
Solicitud y confirmación comparten 10 intentos/minuto por dirección de conexión,
separados del límite de login/registro. El guard aplica el límite por metadata,
incluida la barra final. Es local a cada proceso; centralizarlo antes de publicar.

SMTP sin configurar o inaccesible devuelve 503 también para cuentas desconocidas:
la conexión se comprueba antes de consultar el usuario. Si falla el envío, se
elimina solo el token recién emitido y se responde 503. Un reintento emite un token
nuevo. Este envío síncrono es para pruebas locales; para producción queda pendiente
una estrategia de entrega/reintentos y mitigación de diferencias temporales o
rechazos SMTP por destinatario. Una respuesta genérica no elimina todos los
canales de enumeración.

## Persistencia y seguridad

La migración `20261013183000_password_recovery` agrega `PasswordReset`. Guarda
solo SHA-256 de un token aleatorio de 32 bytes, usuario, creación y expiración.
Un usuario tiene como máximo un token; una nueva solicitud sustituye al anterior.
Caduca a los 15 minutos. Solicitarlo no cambia contraseña ni revoca sesiones.

El consumo, el cambio de contraseña y la revocación de sesiones/tokens ocurren en
una transacción bajo `catalogWrite`. Dos confirmaciones simultáneas no pueden usar
el mismo token. Cambiar contraseña por cualquier flujo, modificar rol o desactivar
una cuenta invalida los tokens pendientes. El consumo comprueba el estado activo.

El enlace usa exclusivamente `PASSWORD_RESET_URL`, nunca Host de la solicitud.
El token viaja en `#token=...`, que no se envía en el GET. El formulario lo retira
del historial y lo envía por POST. La página usa `no-store`, `no-referrer` y una
CSP con hash para su script, sin recursos de terceros. SMTP no registra contenido.

Mailpit usa SMTP local sin TLS. Para correo externo configurar remitente,
credenciales y TLS; el transporte requiere STARTTLS por defecto salvo configuración
local explícita. La URL de recuperación admite HTTP solo en localhost/loopback,
o HTTPS, sin credenciales, query ni fragmento preconfigurados.

## Pruebas aisladas

La suite requiere PostgreSQL terminado en `_test` y otro Mailpit, separado del
buzón habitual. No envía correo a Internet.

```powershell
docker run --detach --name tienda-mailpit-test --publish 127.0.0.1:11025:1025 --publish 127.0.0.1:18025:8025 axllent/mailpit:v1.31.5
$env:TEST_MAILPIT_URL = 'http://127.0.0.1:18025'
$env:TEST_SMTP_PORT = '11025'
# Preparar TEST_DATABASE_URL y migrar como indica el README.
npm run test:e2e -- --runInBand
Remove-Item Env:TEST_MAILPIT_URL
Remove-Item Env:TEST_SMTP_PORT
docker stop tienda-mailpit-test
```

`test/password-recovery.e2e-spec.ts` verifica SMTP real capturado, respuesta
genérica, Origin, DTO, hash persistido, expiración, reemplazo de enlaces,
consumo concurrente, revocación de sesiones, login nuevo, indisponibilidad SMTP
y límites de intentos. No utiliza cuentas de la base habitual.
