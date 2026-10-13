# Backend de gestión de productos

API NestJS con PostgreSQL y Prisma. Actualmente implementa categorías,
subcategorías, productos, inventario, clientes, ventas, cobros y autenticación.

Para entender su funcionamiento, consulta los [diagramas de flujo](docs/flowcharts.md)
de permisos, ventas, recuperación de contraseña, imágenes, reportes y pruebas.

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

La instalación validada usa npm y `package-lock.json`, también en Docker.
El `pnpm-lock.yaml` histórico no incluye las correcciones de seguridad actuales;
no usarlo para reproducir esta instalación. La URL de `.env.example` es ilustrativa; no crea la base ni el usuario.
La aplicación exige `DATABASE_URL` y falla al iniciar si la base no está disponible.
La migración inicial requiere una base vacía: ver las notas de migración en
[el diseño de base de datos](docs/database-design.md).

- API: `http://localhost:3001/api`
- Swagger: `http://localhost:3001/docs`
- Health: `GET /api/health` (estado del proceso; no es un chequeo de disponibilidad de BD)
- CORS de desarrollo: `http://localhost:3000`
- Recuperar contraseña: `http://localhost:3001/api/auth/reset-password`
- Buzón local Mailpit: `http://localhost:8025` (captura mensajes, no envía a Internet)

## Verificación

Consulta [la guía de pruebas](docs/testing.md) para el alcance de las suites
unitarias y de integración y los casos de regresión añadidos.

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
docker run --detach --name tienda-mailpit-test --publish 127.0.0.1:11025:1025 --publish 127.0.0.1:18025:8025 axllent/mailpit:v1.31.5
$env:TEST_MAILPIT_URL = 'http://127.0.0.1:18025'
$env:TEST_SMTP_PORT = '11025'
$env:TEST_DATABASE_URL = 'postgresql://tienda_test:tienda_test@127.0.0.1:55439/tienda_test'
$env:DATABASE_URL = $env:TEST_DATABASE_URL
npm run prisma:generate
npm run db:migrate
npm run test:e2e -- --runInBand
Remove-Item Env:DATABASE_URL
Remove-Item Env:TEST_DATABASE_URL
Remove-Item Env:TEST_MAILPIT_URL
Remove-Item Env:TEST_SMTP_PORT
docker stop tienda-postgres-test
docker stop tienda-mailpit-test
```

El test e2e exige `TEST_DATABASE_URL`, nunca reutiliza silenciosamente la conexión
normal, crea sus propios registros y los elimina al terminar. Comprueba PATCH
inválidos sin cambios parciales, duplicados, concurrencia, activación, rutas y
persistencia tras recrear la aplicación. Jest usa VM modules para las importaciones
dinámicas del cliente Prisma.

## Base de datos

El esquema ejecutable del catálogo está en [prisma/schema.prisma](prisma/schema.prisma).
El [diseño documentado](docs/database-design.md) distingue la implementación vigente
de las propuestas históricas. Cada cambio de esquema tiene su propia migración.

La API conserva las rutas existentes y las bajas lógicas; una descripción ausente
se devuelve como `null`. Las rutas de gestión usan autenticación por sesión y
autorización por rol mediante AccessGuard global.

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

## Usuarios, autenticación y permisos

Se agregaron User, Session y Customer. Customer.userId es opcional y único: permite contactos comerciales sin cuenta; registrarse crea una cuenta CUSTOMER con perfil asociado. Los roles actuales son ADMIN, SELLER y CUSTOMER.

| Operación | Administrador | Vendedor | Cliente / visitante |
| --- | --- | --- | --- |
| Leer catálogo de gestión | Sí, incluye costos | Sí, sin costos | No |
| Modificar catálogo | Sí | No | No |
| Administrar usuarios y restablecer contraseñas | Sí | No | No |
| Consultar catálogo público activo | Sí | Sí | Sí |
| Editar nombre y contraseña propia | Sí | Sí | Cliente autenticado |
| Editar documento/teléfono propio | No | No | Cliente autenticado |

La recuperación de contraseña local está disponible con [Mailpit y formulario independiente](docs/password-recovery-api.md).
Las compras de autoservicio siguen pendientes. Un administrador también puede restablecer contraseñas desde Usuarios.
Ya hay [imágenes de productos](docs/product-images-api.md), una por producto,
y [reportes de ventas e inventario](docs/reports-api.md) para ADMIN.
Las pantallas frontend de estas funciones todavía requieren integración.
Las opciones para el siguiente paso están en [recuperación de contraseña](docs/password-recovery-options.md).

### Primer administrador

Desde este directorio, con Docker iniciado:

```powershell
docker compose exec backend node scripts/create-admin.cjs
```

El comando solicita nombre, correo y contraseña sin mostrarla. Solo funciona si todavía no existe un administrador. No hay credenciales predeterminadas. Después abre http://localhost:3000/login y crea otros usuarios desde Usuarios. Fuera de Docker: aplica migraciones, ejecuta `npm run build` y `npm run admin:create` con DATABASE_URL configurada.

### Datos de prueba

Después de aplicar las migraciones y compilar el backend, ejecuta desde este
directorio para cargar categorías, subcategorías y productos de ejemplo:

```powershell
npm run build
$env:SEED_ADMIN_EMAIL = 'correo-de-tu-administrador@ejemplo.com'
npm run db:seed
```

El catálogo de `scripts/seed-data.cjs` contiene 6 categorías, 12 subcategorías y
36 productos de electrónica, computación, hogar, oficina, deportes y cuidado
personal. Incluye `quantity` (stock inicial) y `minStock` por producto: hay ejemplos
agotados, con stock bajo y disponible. Los códigos de barras son sintéticos para desarrollo.

El comando es idempotente: agrega registros faltantes y conserva los existentes,
incluidos precios, nombres, relaciones y estados. Reconoce categorías por nombre
normalizado, subcategorías por categoría y nombre normalizado, y productos por SKU.
Inicializa existencias y mínimo únicamente en productos activos de la misma
subcategoría cuyo inventario esté en cero, con mínimo cero y sin movimientos.
Esto incluye los productos cargados antes de agregar inventario. Conserva todo
inventario ya gestionado, incluso si volvió a cero. Cada cantidad positiva genera
una entrada con el motivo `Stock inicial de ejemplo (seed)` y el administrador
indicado en `SEED_ADMIN_EMAIL`. Configura esta variable con el correo de un
administrador activo existente; no se crean cuentas. Si falta un administrador
válido cuando se necesita registrar stock, se revierte toda la carga.

Omite ramas de categorías o subcategorías inactivas. Un código de barras ocupado
por otro SKU cancela toda la carga; no deja cambios parciales. Valida los datos
con los mismos DTO del backend. No elimina registros ni crea usuarios o contraseñas.
Configura `DATABASE_URL` para la base de datos de desarrollo antes de ejecutarlo.
Con Docker Compose, reconstruye la imagen para incluir la versión actual del script
y luego carga los datos:

```powershell
docker compose up -d --build backend
docker compose exec -e SEED_ADMIN_EMAIL=correo-de-tu-administrador@ejemplo.com backend node scripts/seed.cjs
```

Para comprobar el seed: compila, aplica las migraciones a una base temporal y
configura `TEST_DATABASE_URL` con su URL, cuyo nombre debe terminar en `_test`.
Ejecuta `npm run test:seed`. Las pruebas borran el catálogo de esa base de prueba;
no utilices una base con datos que necesites conservar.

### Inventario de productos

Productos incluye stock disponible, stock mínimo e historial de entradas, salidas
y ajustes por conteo. Administradores registran movimientos y vendedores consultan.
Los productos empiezan en cero; carga sus existencias mediante una entrada de stock
inicial. Consulta [la documentación de inventario](docs/inventory-api.md) para rutas,
permisos, reglas y actualización de la base de datos.

### Clientes y ventas

ADMIN y SELLER pueden buscar y crear clientes sin cuenta, y registrar y consultar
ventas con descuento transaccional de stock. ADMIN también edita y desactiva
clientes. Las ventas conservan precios y datos históricos, y los reintentos no
duplican ventas ni movimientos. Consulta [clientes y ventas](docs/customers-sales-api.md).
Cobros manuales (efectivo, tarjeta o transferencia), reembolsos, devoluciones parciales
y anulaciones están disponibles desde el detalle. Una venta registrada no equivale
a un cobro. Consulta [las operaciones de venta](docs/sale-operations-api.md).

### Sesiones y configuración

Las contraseñas usan scrypt con sal aleatoria. Las sesiones duran 12 horas y se almacenan como hashes en PostgreSQL; la cookie `tienda_session` es HttpOnly y SameSite=Lax. Cerrar sesión elimina la sesión del servidor. Cambiar/restablecer contraseña, cambiar rol o desactivar una cuenta revoca sus sesiones. No se puede desactivar o degradar la propia cuenta administradora ni dejar el sistema sin administrador activo.

Todas las rutas requieren sesión y permisos salvo health, registro, login,
recuperación de contraseña y el catálogo público `/api/shop/products` con sus imágenes.
El registro público siempre crea CUSTOMER; enviar un rol adicional se rechaza.
Las escrituras requieren Origin incluido en TRUSTED_ORIGINS. Clientes HTTP como
Postman también deben enviar este encabezado. Las consultas de perfil usan el
usuario autenticado y no aceptan un userId externo.

`TRUSTED_ORIGINS` contiene orígenes separados por comas, sin barra final. En despliegue configura el origen HTTPS real y `COOKIE_SECURE=true`. Compose usa `COOKIE_SECURE=false` exclusivamente para localhost HTTP. Nuxt usa un proxy del mismo origen hacia este backend. Login y registro admiten 10 intentos/minuto por dirección de conexión; el límite es local a cada proceso y, detrás del proxy Nuxt, se comparte por su conexión. Para múltiples instancias o publicación utiliza un límite centralizado en el proxy de confianza. No habilitar trust proxy sin restringir el acceso directo.

### Pruebas

Con TEST_DATABASE_URL apuntando a una base independiente terminada en `_test`, ejecuta `npm run test:e2e -- --runInBand`. Incluye autenticación real, acceso por rol, ocultamiento de costos, aislamiento de perfil, revocación y catálogo público activo. Las suites del catálogo sustituyen el guard para probar separadamente sus reglas de negocio.

### Dependencias y revisión de permisos

La revisión del 13/10/2026 actualizó las dependencias compatibles y eliminó los
hallazgos críticos. Consulta las versiones, excepciones y avisos restantes en
[seguridad de dependencias](docs/dependency-security.md).
La matriz de acceso de las 49 rutas, sus comprobaciones y las funcionalidades
pendientes están en [permisos y pendientes](docs/permissions-and-backlog.md).

## Código compartido

La validación de paginación se encuentra en `src/common/dto/pagination.dto.ts`; productos, usuarios y catálogo público usan los mismos límites. Los filtros de estado y la validación de IDs se encuentran en `src/common`. Las consultas públicas del catálogo están separadas en ShopModule/ShopService.

AuthService centraliza la creación de cuentas y el reemplazo de contraseñas con revocación de sesiones. El registro público fija CUSTOMER; el controlador de usuarios mantiene la autorización de administrador. `session-cookie.ts` contiene el nombre y la lectura validada de la cookie; `config-origins.ts` comparte la configuración entre CORS y la protección de escrituras.

Las reglas de desactivación, cambios de padre y unicidad de categorías, subcategorías y productos permanecen en sus servicios porque tienen restricciones distintas. No se añadió un CRUD genérico que esconda estas reglas ni se modificó el esquema de la base de datos.
