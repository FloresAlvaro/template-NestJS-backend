# Pruebas del backend

## Pedidos de autoservicio

La implementación de pedidos añade 13 casos unitarios y 18 de integración.
Validación actual: **72 unitarios en 7 suites** y **117 de integración en 10
suites**, más 8 unitarios y 2 de integración del script de administrador. Los conteos históricos de
abajo corresponden a ampliaciones anteriores.

`test/orders.e2e-spec.ts` verifica sesiones y Origin reales, aislamiento del
propietario, precisión monetaria, reservas, cancelación, expiración y reinicio,
confirmación y entrega con cobros manuales. Incluye compras concurrentes entre
clientes y ventas de mostrador, reintentos idempotentes y un fallo de base de
datos que comprueba rollback de venta, stock, pedido y auditoría.

Ejecutar las migraciones y la integración exclusivamente en una base aislada
terminada en `_test`, siguiendo la preparación indicada abajo. Para ejecutar
solo esta suite: `npm run test:e2e -- --runInBand orders.e2e`.

Consulta también [el diagrama de ejecución de pruebas](flowcharts.md#8-cómo-funcionan-las-pruebas)
y los flujos de negocio que verifican estas suites.

La ampliación del 13/10/2026 añade 45 casos unitarios y 15 de integración:
el resultado validado es **59 unitarios en 6 suites** y **97 de integración en
8 suites**. Son conteos de casos, no porcentajes de cobertura.

La corrección posterior del PR añade dos regresiones HTTP de límites de
autenticación: el total Jest e2e pasa a **99 casos en 9 suites**. El script del
administrador añade **8 casos unitarios y 2 de integración** con el runner de Node,
contados por separado de los 59 unitarios de Jest.

## Pruebas unitarias

```powershell
npm run test:unit
```

No necesitan PostgreSQL ni Mailpit. La configuración Jest de `package.json`
resuelve los imports relativos `.js` del cliente Prisma generado, igual que la
configuración e2e. Generar el cliente previamente con `npm run prisma:generate`
en una instalación nueva.

Las suites nuevas cubren:

- `src/auth/access.guard.spec.ts`: permisos predeterminados, excepciones de
  escritura, prioridad del método sobre el controlador, Origin en rutas públicas,
  sesión ausente/revocada/caducada, usuario inactivo, error de base de datos y
  expiración de la ventana de límites de recuperación.
- `src/auth/recovery-mail.service.spec.ts`: URL y puertos inválidos, credenciales
  incompletas, TLS predeterminado, token en fragmento del enlace configurado,
  errores SMTP sin exponer secretos y cierre del transporte.
- `src/sales/sales-view.spec.ts`: pagos fraccionarios exactos, deuda tras devolución,
  reembolso manual pendiente, estados e historial, importes superiores al entero
  seguro de JavaScript y ausencia de hashes internos en JSON.
- `src/reports/reports.service.spec.ts`: rechazo de períodos inválidos antes de
  consultar la base, límite de 366 días, conversión de zona horaria y propagación
  de errores SQL. Los agregados SQL se prueban en integración, no con mocks.

Las pruebas existentes de DTO y campos PATCH siguen incluidas.

## Integración

Seguir la preparación de PostgreSQL y Mailpit aislados del README y configurar
`TEST_DATABASE_URL` (base terminada en `_test`), `TEST_MAILPIT_URL` y
`TEST_SMTP_PORT`. Usar DATABASE_URL de esa misma base temporal al migrar.

```powershell
npm run db:migrate
npm run test:e2e -- --runInBand
```

`test/report-image-boundaries.e2e-spec.ts` añade 11 casos con HTTP, sesiones reales
y PostgreSQL:

- Período `[from, to)` con desplazamiento horario y fechas imposibles.
- Deuda y saldo a reembolsar de ventas distintas sin compensarlos entre sí;
  operaciones posteriores a la fecha de la venta.
- Ranking con nombres y SKU históricos tras edición y desactivación.
- Paginación estable de alertas, stock cero e inventario ausente.
- Contenido JPEG/PNG/WebP con extensión y MIME engañosos.
- Límite de píxeles decodificados sin reemplazar la imagen anterior.
- Multipart ausente, campos extra, campo incorrecto, duplicados e IDs inválidos.
- Cargas simultáneas: una única imagen válida, sin cambios de precio, stock o
  movimientos; eliminación idempotente.
- Lectura pública restringida por activación de la subcategoría.

`test/password-recovery.e2e-spec.ts` incorpora cuatro casos adicionales:
invalidación del enlace por cambio de rol y por desactivación administrativa;
rollback de contraseña, sesiones y token ante un fallo inyectado dentro de la
transacción; y conservación de contraseña/sesiones al solicitar un enlace.
El rollback usa PostgreSQL real y solo inyecta el fallo del servicio.

Las suites previas de autenticación, inventario, ventas, reportes, imágenes y
SMTP capturado siguen ejecutándose. Los fixtures se crean y limpian en la base
temporal; no usar la base habitual ni el buzón Mailpit local del usuario.

## Otras comprobaciones

### Regresiones del primer administrador y del límite de autenticación

Después de `npm run build`:

```powershell
npm run test:admin
```

No requiere base de datos. Rechaza correos que el login no admite, valida nombres,
límites de contraseña y confirmación, conserva normalización y verifica que una
entrada inválida no abre una transacción.

En una base desechable terminada en `_test`, migrada y **sin administradores**:

```powershell
npm run test:admin:e2e
```

Esta suite utiliza TEST_DATABASE_URL, comprueba que el administrador creado por
el script puede iniciar sesión por HTTP y que no se permite ejecutar nuevamente
el bootstrap. Elimina solo su cuenta al finalizar. No borrar administradores de
otra base para preparar esta prueba.

`test/auth-throttle.e2e-spec.ts`, incluida en `test:e2e`, verifica que login y
registro comparten su contador con mayúsculas, prefijo en mayúsculas y barra
final. Origin se valida antes de contar. El límite ahora se aplica mediante
metadata de las rutas, sin comparar el texto de la URL.

```powershell
npm run build
npx eslint "src/**/*.ts" "test/**/*.ts"
```

La ampliación inicial no modificó los contratos. La corrección posterior conserva
rutas, esquema y dependencias, y cierra el bypass del límite de autenticación.
Para actualizar una instancia local que siga ejecutando el código anterior,
usar `docker compose up -d --build backend`.
