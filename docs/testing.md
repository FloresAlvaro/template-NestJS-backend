# Pruebas del backend

[Índice de diagramas y UML](diagrams/README.md) ·
[Secuencias de pedidos verificadas por integración](diagrams/uml-sequences.md)

## Pedidos de autoservicio

La implementación de pedidos añade 13 casos unitarios y 18 de integración.
Última validación del 14/10/2026: **81 unitarios en 9 suites** y **137 de integración en 12
suites**, más 8 unitarios y 2 de integración del script de administrador. Los conteos históricos de
abajo corresponden a ampliaciones anteriores.

`test/purchases.e2e-spec.ts` añade 10 casos de proveedores y compras con sesiones
reales: autorización ADMIN, validación, históricos, Decimal, recepción concurrente,
idempotencia, cancelación, costos opcionales, desbordamiento y rollback de entradas
y costos. Ver [contrato y alcance](purchases-api.md).

La suite `npm run test:seed` verifica **18 casos** del catálogo, demo comercial,
proveedores/compras y modo `--local`. Comprueba login y permisos de ADMIN, dos
SELLER y CUSTOMER, una cuenta inactiva, recepción y costos coherentes, rollback,
colisiones, ampliación desde una demo anterior e idempotencia sin restablecer
contraseñas ni cambios manuales. El modo local también se ejecuta como proceso
CLI real y se comprueba que no imprime la contraseña pública de prueba.

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

## Gráficos de reportes

`test/report-charts.e2e-spec.ts` añade 10 casos HTTP con PostgreSQL real:
permisos por rol, fechas inclusivas/exclusivas y medianoche de America/La_Paz,
series diarias/mensuales con períodos vacíos, ranking global por unidades o importe,
agrupación de vendedores, cobros por fecha de operación sin reembolsos,
validación de parámetros, importes mayores al entero seguro de JavaScript y
reservas vigentes en alertas. También comprueba que las consultas no modifican datos.

Solo esta suite: `npm run test:e2e -- --runInBand report-charts.e2e`.
Los conteos anteriores describen una ejecución comprobada, no cobertura porcentual.

## Pruebas unitarias

```powershell
npm run test:unit
```

No necesitan PostgreSQL ni Mailpit. La configuración Jest de `package.json`
resuelve los imports relativos `.js` del cliente Prisma generado, igual que la
configuración e2e. Generar el cliente previamente con `npm run prisma:generate`
en una instalación nueva.

Las suites nuevas cubren:

- `src/common/utils/request-hash.spec.ts`: compatibilidad con hashes de ventas,
  pagos y pedidos anteriores y distinción de cantidades e importes modificados.
- `src/common/utils/search-filter.spec.ts`: búsqueda literal con porcentajes,
  guiones bajos, barras invertidas, acentos y texto vacío.

- `src/auth/guards/access.guard.spec.ts`: permisos predeterminados, excepciones de
  escritura, prioridad del método sobre el controlador, Origin en rutas públicas,
  sesión ausente/revocada/caducada, usuario inactivo, error de base de datos y
  expiración de la ventana de límites de recuperación.
- `src/auth/services/recovery-mail.service.spec.ts`: URL y puertos inválidos, credenciales
  incompletas, TLS predeterminado, token en fragmento del enlace configurado,
  errores SMTP sin exponer secretos y cierre del transporte.
- `src/sales/presenters/sales-view.spec.ts`: pagos fraccionarios exactos, deuda tras devolución,
  reembolso manual pendiente, estados e historial, importes superiores al entero
  seguro de JavaScript y ausencia de hashes internos en JSON.
- `src/reports/services/reports.service.spec.ts`: rechazo de períodos inválidos antes de
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

## Caja y alertas

La suite cash-alerts.e2e-spec.ts amplía la batería con transacciones de caja y alertas por disponibilidad. Se ejecuta con test:e2e sobre TEST_DATABASE_URL terminada en _test. Para la batería completa, conservar Mailpit temporal para recuperación de contraseña. La prueba de rollback genera intencionalmente un error 500 y verifica que no se guardan cobros ni movimientos parciales.

El seed demo también prueba cinco turnos, diez movimientos y tres cierres con diferencias exactas (0.00, -5.00, 2.00). Verifica ampliación desde una demo sin caja, preservación de movimientos posteriores, rechazo de colisiones/turnos ajenos y rollback completo ante un fallo de caja.

La suite admin-features.e2e-spec.ts verifica auditoría transaccional, promociones y notificaciones de pedidos contra PostgreSQL y Mailpit aislados. Requiere TEST_DATABASE_URL, TEST_MAILPIT_URL y TEST_SMTP_PORT. Los errores 500 de auditoría son inyectados intencionalmente para probar rollback; no indican un fallo de la suite.

## Regresiones de autenticación — 15/10/2026

`test/auth-throttle.e2e-spec.ts` verifica concurrencia entre dos aplicaciones,
aislamiento de clientes firmados, rechazo de firmas manipuladas y renovación de
ventana con PostgreSQL real. `test/setup-auth-throttle.ts` limpia exclusivamente
los contadores en la base `_test` antes de cada caso; no los reinicia entre las
instancias creadas dentro del mismo caso.

### Validación de los fixes del 15/10/2026

- Build del backend, ESLint, 88 pruebas unitarias y 8 pruebas de administrador: correctos.
- PostgreSQL 17 y Mailpit temporales en Docker, base `market_review_test`: 15
  migraciones aplicadas y 161 pruebas e2e de 14 suites correctas. Los errores
  simulados de auditoría, ledger y movimientos forman parte de pruebas de rollback.
- Imagen del Dockerfile construida y arrancada como usuario node; migraciones
  de arranque correctas. Nuxt compilado en el host contra esa API: login firmado
  (descartando cabeceras falsas), sesión, pantallas de gestión, logout y revocación.
- API detenida: `/`, `/login` y `/shop` responden 200 con aviso; `/sales` responde 503.
- Frontend: typecheck/build y seis pruebas Node correctas; login y recuperación
  de conexión revisados en navegador.
- No se actualizó la base ni el despliegue habitual. El despliegue de esta versión
  requiere la migración nueva y el secreto compartido descrito en auth-throttle.md.
- La construcción sigue mostrando avisos de dependencias ya documentados en
  dependency-security.md; no se aplicaron actualizaciones incompatibles.

### Revisión previa a PR — 15/10/2026

Se repitieron build, ESLint, 88 pruebas unitarias y 8 del administrador.
En Docker, dos bases desechables independientes (`market_pr_test` y
`market_seed_test`) recibieron las 15 migraciones; pasaron 162 pruebas e2e y
22 del seed. La regresión nueva verifica limpieza acotada de contadores vencidos
sin reiniciar contadores activos. El rechazo de promoción 403 incluye ahora el
código `PROMOTION_NOT_ALLOWED`, comprobado por e2e, para distinguirlo del guard.
Frontend: typecheck/build y siete pruebas correctas; conserva UUID tras perder
la respuesta y recibir después errores 401/403/408/429 o del transporte, y separa
los cobros pendientes por usuario. La auditoría npm de producción sigue mostrando
tres paquetes con severidad alta en la cadena Prisma/deepmerge-ts y cero críticos;
no se forzaron cambios incompatibles. No hay CI versionado en estas ramas.

### Dependencias, CI y preparación de despliegue — 15/10/2026

- Override Prisma 7.10.0/deepmerge-ts 8.0.2: carga real de configuración y caso
  circular correctos en dos pruebas; producción sin vulnerabilidades npm y
  veinte moderados de desarrollo (cero altos/críticos).
- 88 unitarias, 8 pruebas del administrador, 4 de preflight y 7 del frontend
  correctas; build/lint/typecheck correctos. Bootstrap real: dos pruebas correctas.
- Con la dependencia corregida, quince migraciones, 162 e2e y 22 del seed
  correctas sobre bases Docker desechables independientes. Se observó un socket
  hang up en pedidos; la repetición pasó y el fixture de pedidos usa ahora un
  listener persistente para evitar el listen/close implícito por petición.
- Backup y pg_restore sobre otro destino temporal: coinciden 3363 registros de
  auditoría y las quince migraciones; no se usó la base habitual.
- La imagen de producción construye y aplica migraciones sobre otra base vacía.
- SSR público con API caída comprobado mediante scripts/check-public-ssr.mjs.
- CI versionado en ambos repositorios, sin secretos ni despliegues. Los checks
  remotos se consultan en cada PR; una ejecución local no sustituye su resultado.
