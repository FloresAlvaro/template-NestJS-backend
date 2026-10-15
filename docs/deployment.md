# Actualización coordinada del backend y Nuxt

El CI valida código y bases temporales. No despliega, no contiene secretos de
producción y no autoriza cambios sobre la base habitual. La actualización de una
instancia con datos se ejecuta después de reconciliar operaciones y comprobar un
backup restaurable. No usar migrate reset, db push ni down -v.

## 1. Confirmar los envíos pendientes de la versión anterior

Una operación pendiente de confirmar es un envío cuya respuesta se perdió; no
significa una venta sin cobrar. Antes de reemplazar el frontend, cada operador
debe revisar sus pestañas abiertas y los avisos de envío pendiente.

Reintentar con la versión anterior conserva su UUID. Comprobar el resultado en
el historial de venta y, para cobros, en el turno correspondiente. Si el resultado
sigue siendo incierto, conservar la pestaña y solicitar reconciliación; no borrar
sessionStorage ni registrar otra operación para sustituirla. Las claves antiguas
guardadas solo por venta no se asignan automáticamente a un usuario nuevo.

Si todo lo registrado es una demo desechable, documentar ese contexto; no trasladar
esa suposición a datos reales. Esta comprobación se hace en los navegadores de los
operadores: el servidor no puede inspeccionar su sessionStorage.

## 2. Preparar el secreto compartido y revisar la configuración

Usar un secreto aleatorio de 32+ caracteres, generado una sola vez, idéntico en
AUTH_PROXY_SECRET (backend) y NUXT_AUTH_PROXY_SECRET (Nuxt). Mantenerlo privado en
los entornos de ambos servidores, nunca en Git ni runtimeConfig.public. Rotarlo
de forma coordinada: claves diferentes hacen que las escrituras de autenticación
reenviadas sean rechazadas. Ver [frontera de confianza](auth-throttle.md).

En local, Compose carga AUTH_PROXY_SECRET del .env del backend. Nuxt dev carga
su propio .env. Para arrancar la salida compilada con Node 24 desde el frontend:

```bash
node --env-file=.env .output/server/index.mjs
```

El preflight solo lee configuración, no conecta ni migra la base y no imprime
secretos. Desde el backend, con ambos .env locales preparados:

```bash
npm run deploy:check -- --compose --frontend-env ../template-NuxtJS-frontend/.env
```

Fuera de Compose, proporcionar DATABASE_URL, TRUSTED_ORIGINS, AUTH_PROXY_SECRET
y las variables NUXT_* mediante el entorno, o leer estas últimas con --frontend-env.
En producción ejecutar también la validación HTTPS/cookie:

```bash
npm run deploy:check -- --production --frontend-env /ruta/privada/frontend.env
```

Configurar el origen HTTPS real en TRUSTED_ORIGINS y COOKIE_SECURE=true. La URL
privada NUXT_BACKEND_API_BASE debe terminar en /api y ser accesible desde Nuxt.
Para un balanceador delante de Nuxt se debe definir su frontera de confianza;
no aceptar X-Forwarded-For de cualquier cliente.

## 3. Crear y verificar un backup

Conservar un dump PostgreSQL de la instancia que se actualizará y registrar el
commit/imagen actual. Guardar el dump fuera de Git con permisos restringidos.
Desde el backend, para el Compose local (el nombre del archivo debe ser nuevo):

```bash
umask 077
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > /ruta/privada/tienda-antes-de-actualizar.dump
```

Comprobar que pg_dump terminó con éxito y el archivo no está vacío. Verificar
la restauración en otra base/instancia identificada por separado, nunca sobre
la base original. Para un destino temporal llamado restore_test y el dump
montado/copiado allí, ejecutar pg_restore --exit-on-error --no-owner --no-privileges
y comprobar cantidades, migraciones y registros representativos. Conservar
tanto el dump como la confirmación de la prueba hasta finalizar el despliegue.

## 4. Actualizar primero el backend

Aplicar migraciones versionadas antes de servir el código nuevo. El Dockerfile
ya ejecuta migrate deploy antes de Nest; si la migración falla, no arranca la API.
Con la configuración y el backup verificados, para la instancia local:

```bash
docker compose up -d --build --wait backend
docker compose exec backend node node_modules/prisma/build/index.js migrate status
```

Sin Docker, usar npm ci, npm run build y npm run db:migrate con DATABASE_URL
apuntando explícitamente al destino elegido. Revisar migrate status antes de iniciar
el servidor. No ejecutar seeds sobre una base real para verificar esta actualización.

## 5. Actualizar Nuxt y comprobar el resultado

Instalar con pnpm install --frozen-lockfile, compilar con pnpm run build y
reiniciar Nuxt conservando sus variables privadas. Comprobar login por /api,
perfil, permisos de rol, listado de catálogo y consulta de ventas/turnos. Las
operaciones que modifican dinero o stock se validan con datos de prueba aislados.

Comprobar logs sin divulgar secretos y el estado de migraciones. /api/health
solo confirma el proceso; una consulta de catálogo verifica además la lectura
de base de datos. Los reintentos no deben crear nuevos movimientos.

Si falla, detener escrituras y conservar la evidencia. No borrar migraciones ni
restaurar el backup sobre datos nuevos sin reconciliación. Un rollback de código
debe ser compatible con el esquema ya aplicado; la restauración es una decisión
operativa que puede perder cambios posteriores al backup.
