# Backend de gestión de productos

API NestJS con PostgreSQL y Prisma. Actualmente implementa categorías,
subcategorías, productos y health. Inventario, ventas y autenticación están pendientes.

## Configuración

Requiere Node.js 22.12+ o 24 y una instancia PostgreSQL. Desde esta carpeta:

```powershell
npm ci
Copy-Item .env.example .env
# Editar DATABASE_URL en .env con la conexión de desarrollo.
npm run prisma:generate
npm run db:migrate
npm run start:dev
```

También se incluye `pnpm-lock.yaml` para quienes usan pnpm. Utilizar un solo gestor
por instalación. La URL de `.env.example` es ilustrativa; no crea la base ni el usuario.
La aplicación exige `DATABASE_URL` y falla al iniciar si la base no está disponible.
La migración inicial requiere una base vacía: ver las notas de migración en
[el diseño de base de datos](docs/database-design.md).

- API: `http://localhost:3001/api`
- Swagger: `http://localhost:3001/docs`
- Health: `GET /api/health` (estado del proceso; no es un chequeo de disponibilidad de BD)
- CORS de desarrollo: `http://localhost:3000`

## Verificación

```powershell
npm run build
npm run test:unit
npx eslint "src/**/*.ts" "test/**/*.ts"
```

`build` genera el cliente Prisma y compila a `dist`; `npm run start:prod` ejecuta
`dist/src/main.js`. La carpeta `generated/prisma` se genera, no se versiona.

### Pruebas con PostgreSQL

Usar una base separada cuyo nombre termine en `_test`. Por ejemplo:

```powershell
docker run --detach --name tienda-postgres-test --publish 127.0.0.1:55439:5432 --env POSTGRES_USER=tienda_test --env POSTGRES_PASSWORD=tienda_test --env POSTGRES_DB=tienda_test postgres:17-alpine
$env:TEST_DATABASE_URL = 'postgresql://tienda_test:tienda_test@127.0.0.1:55439/tienda_test'
$env:DATABASE_URL = $env:TEST_DATABASE_URL
npm run prisma:generate
npm run db:migrate
npm run test:e2e -- --runInBand
Remove-Item Env:DATABASE_URL
Remove-Item Env:TEST_DATABASE_URL
docker stop tienda-postgres-test
```

El test e2e exige `TEST_DATABASE_URL`, nunca reutiliza silenciosamente la conexión
normal, crea sus propios registros y los elimina al terminar. Comprueba PATCH
inválidos sin cambios parciales, duplicados, concurrencia, activación, rutas y
persistencia tras recrear la aplicación. Jest usa VM modules para las importaciones
dinámicas del cliente Prisma.

## Base de datos

El esquema ejecutable del catálogo está en [prisma/schema.prisma](prisma/schema.prisma).
El [diseño documentado](docs/database-design.md) distingue el catálogo implementado
de la propuesta de inventario y ventas. Productos cuenta con su propia migración.

La API conserva las rutas existentes y las bajas lógicas; una descripción ausente
se devuelve como `null`. Las rutas todavía no tienen autenticación ni autorización;
incorporar usuarios y permisos antes de exponer operaciones de gestión públicamente.

## Productos

Ver [el contrato de productos](docs/products-api.md) para ejemplos, filtros,
formatos monetarios y reglas de activación. `npm run db:migrate` aplica la nueva
migración de productos sin eliminar el catálogo existente.

## Ejecutar permanentemente con Docker

Desde esta carpeta, con Docker Desktop iniciado:

```powershell
docker compose up --build -d --wait
```

Compose crea el backend y PostgreSQL en la red interna. No requiere instalar Node
ni crear un `.env` para esta modalidad. Las credenciales incluidas son exclusivamente
para desarrollo local; PostgreSQL no publica un puerto en el equipo y el backend
solo se publica en `127.0.0.1:3001`.

- API: http://localhost:3001/api
- Swagger: http://localhost:3001/docs
- Estado: `docker compose ps`
- Logs: `docker compose logs -f backend`
- Actualizar después de cambiar el código: `docker compose up --build -d --wait`
- Detener temporalmente: `docker compose stop`
- Volver a iniciar después de detenerlo: `docker compose start`

Las migraciones se aplican antes de iniciar el backend. La base guarda sus datos
 en el volumen `tienda-local_postgres_data`, independiente de los contenedores.
`docker compose down` conserva ese volumen; `docker compose down -v` elimina los
datos y no debe usarse salvo que se quiera borrar la base local.

Ambos servicios usan `restart: unless-stopped`: se reinician al arrancar Docker,
si no los detuviste manualmente. Para que estén disponibles al iniciar sesión en
Windows, habilita **Start Docker Desktop when you sign in** en Docker Desktop.
El equipo y Docker deben estar funcionando para que la API esté disponible.
No es necesario ejecutar `npm run start:dev` mientras el contenedor está activo.

Esta modalidad crea una base nueva propia de Docker; no importa automáticamente
datos de otras instancias PostgreSQL. El código se incluye en la imagen: los cambios
requieren reconstruirla, no se recargan automáticamente.
