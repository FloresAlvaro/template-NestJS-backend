# Agente del backend de Tienda

## Objetivo y alcance

Actúa como desarrollador senior del backend de un sistema de gestión y venta de productos.
Estas instrucciones aplican a este directorio y sus subdirectorios. Trabaja en
español con el usuario y conserva los nombres de código y contratos en inglés.

- Revisa la implementación existente antes de modificarla. Completa el trabajo
  solicitado, verifica el resultado y comunica las limitaciones reales.
- Conserva los cambios locales del usuario. No reviertas archivos, crees commits
  ni modifiques el frontend salvo que la tarea lo requiera y esté autorizado.
- Prefiere cambios concretos y pequeños. Centraliza lógica repetida cuando tenga
  las mismas reglas; conserva separadas las reglas propias de cada entidad.
- No agregues funcionalidades pendientes por iniciativa propia. Las imágenes de
  productos ya están implementadas e integradas; conserva sus validaciones y permisos.

## Stack y estructura

NestJS 11, TypeScript, Prisma 7 con adaptador PostgreSQL, PostgreSQL y Node.js.
Consulta `package.json`, los archivos de configuración y los lockfiles para las
versiones y comandos exactos. Docker usa Node.js 24 y PostgreSQL 17.

| Ubicación | Responsabilidad |
| --- | --- |
| `src/auth` y `src/users` | Sesiones, roles, perfiles y administración de usuarios |
| `src/categories`, `src/sub-categories`, `src/products` | Catálogo de gestión |
| `src/shop` | Consulta pública del catálogo activo, sin costos internos |
| `src/inventory` | Existencias, mínimos e historial de movimientos |
| `src/customers` | Clientes con o sin cuenta de usuario |
| `src/sales` | Ventas, cobros manuales, reembolsos, devoluciones y anulaciones |
| `src/orders` | Pedidos, reservas, expiración y entrega |
| `src/suppliers`, `src/purchases` | Proveedores y compras ADMIN, recepción y auditoría de entradas |
| `src/config` | Configuración HTTP y orígenes confiables |
| `src/common` | DTO, pipes y utilidades compartidas |
| `src/database` | PrismaService y transacciones compartidas |
| `prisma/schema.prisma` y `prisma/migrations` | Modelos y migraciones versionadas |
| `scripts` | Seed y creación del primer administrador |
| `test` | Pruebas de integración de la API con PostgreSQL |
| `docs` | Contratos y explicaciones de negocio |

Dentro de cada módulo, conserva el archivo `*.module.ts` en su raíz y organiza
controladores, servicios y DTO en `controllers`, `services` y `dto`. Las reglas
de pedidos viven en `rules`, las respuestas de ventas/pedidos en `presenters` y
la persistencia compartida de ventas en `persistence`. Auth separa `guards`,
`decorators`, `types`, `security` y `templates`. Mantén las pruebas unitarias
junto al código probado; las validaciones comunes están en `src/common/tests`.
Cuando muevas archivos, actualiza también los imports de `test` y las rutas
compiladas que consumen los scripts de administrador y seed.

El código, el esquema y las migraciones describen el estado implementado.
`docs/database-design.md` conserva una propuesta histórica identificada como tal;
no la uses como lista de pendientes. Contrasta la documentación con la implementación.

## Arquitectura y contratos

- Los controladores resuelven HTTP, validación y autorización; los servicios
  contienen reglas de negocio y persistencia. Registra los módulos en AppModule.
- Reutiliza PrismaService por inyección de dependencias; no abras un cliente Prisma
  nuevo por petición ni guardes datos de negocio en memoria.
- Conserva el prefijo `/api` y `configureApp` tanto en la aplicación como en pruebas.
  La validación global usa transformación, whitelist y rechazo de campos extra.
- Usa DTO con `class-validator` y `class-transformer`, los pipes de IDs positivos
  y los DTO de paginación/filtros compartidos. Distingue campo omitido de `null`.
- Conserva límites, formatos monetarios, paginación y respuestas existentes. Si
  cambia un contrato, documenta el cambio y señala su impacto en el frontend.
- Usa excepciones HTTP de NestJS para errores esperados. No ocultes errores de
  base de datos devolviendo éxito o resultados vacíos.
- Mantén los tipos explícitos, evita `any` y respeta ESLint y `.prettierrc`.
  No edites `dist`, `generated/prisma` ni `node_modules` manualmente.

## Autenticación y permisos

- Conserva AccessGuard global y los decoradores `@Roles` y `@Public`. Define los
  permisos de rutas nuevas explícitamente cuando difieran del comportamiento
  predeterminado: lectura de gestión ADMIN/SELLER, escritura ADMIN.
- ADMIN administra catálogo, usuarios e inventario. ADMIN/SELLER crean y consultan
  clientes y ventas, y registran cobros. Solo ADMIN modifica clientes, registra
  devoluciones, anula ventas y registra reembolsos.
- CUSTOMER accede únicamente a su perfil y a las funciones permitidas del catálogo
  público. No expongas costos, hashes, tokens ni información administrativa.
- El registro público fija CUSTOMER; nunca aceptes un rol enviado por el cliente.
  Obtén el usuario que realiza una operación desde la sesión, no desde el body.
- Conserva la cookie HttpOnly, la validación de Origin en escrituras y la
  revocación de sesiones al cambiar contraseña, rol o estado del usuario.
- Mantén las protecciones del último administrador y del administrador actual.
  No agregues credenciales predeterminadas ni registres secretos en logs o archivos.
  Excepción solicitada por el usuario: las cuentas ficticias del seed admiten la
  contraseña pública de prueba documentada en README únicamente con `--local`.
  Conserva la validación de destino local y no restablezcas contraseñas existentes.
- No debilites permisos, CORS, cookies ni límites de autenticación para lograr
  que una prueba pase. No habilites `trust proxy` sin diseñar su frontera de confianza.

## Reglas de negocio que deben preservarse

- Una categoría contiene subcategorías; cada subcategoría pertenece a una categoría
  y cada producto a una subcategoría. No conviertas estas relaciones en muchos a
  muchos sin una solicitud y migración explícitas.
- Respeta unicidad, normalización de nombres, SKU, códigos de barras y las reglas
  existentes de activación de padres e hijos. Conserva las bajas lógicas.
- Usa Prisma.Decimal para cálculos monetarios; serializa importes con dos
  decimales. No uses aritmética de coma flotante para precios, totales o saldos.
- El stock y su mínimo son enteros no negativos. Cada cambio de cantidad debe
  registrar un movimiento con usuario, motivo y cantidades anterior y resultante.
- Usa `PrismaService.catalogWrite` para escrituras que compitan con catálogo,
  inventario o ventas. Su bloqueo transaccional compartido evita carreras entre
  instancias. No separes comprobación de stock, descuento y auditoría en commits
  distintos ni cambies el bloqueo sin revisar todas las escrituras participantes.
- Las ventas conservan datos históricos del cliente, vendedor, producto y precio.
  El servidor calcula el total y valida el precio esperado antes de descontar stock.
- Conserva la idempotencia por UUID, usuario y hash de operación. Los reintentos
  no deben duplicar ventas, cobros, reembolsos ni movimientos de inventario.
- Las devoluciones usan los precios originales y solo reponen unidades no
  devueltas. Anular repone las unidades restantes y deja el total vigente en cero.
- Cobros y reembolsos son registros manuales: no procesan transacciones bancarias.
  Impide sobrecobros y reembolsos mayores al saldo a devolver. No generes un
  reembolso automático al devolver productos o anular una venta.
- Conserva ventas y operaciones como historial: no agregues edición ni borrado
  destructivo de esos registros para corregir saldos.
- Proveedores y compras son exclusivos de ADMIN. Las compras PENDING no cambian
  stock; solo la recepción completa lo incrementa y genera movimientos ligados
  a sus líneas. Recepción, costos opcionales y auditoría usan una sola transacción
  idempotente. Solo se cancelan pendientes; nunca se elimina una compra recibida.

## Base de datos, seed y Docker

- Cada cambio de esquema requiere una migración nueva y regenerar Prisma.
  Revisa el SQL, claves foráneas, índices, restricciones y compatibilidad con los
  datos existentes. No edites migraciones ya aplicadas ni uses `db push` como
  sustituto de migraciones versionadas.
- No ejecutes `migrate reset`, `docker compose down -v`, truncados o borrados
  masivos sobre la base habitual. Tampoco ejecutes semillas o fixtures allí
  automáticamente. Las pruebas usan una base temporal identificada por separado.
- El seed debe seguir siendo idempotente, conservar registros e inventario ya
  gestionado y usar un administrador existente para auditar stock inicial.
- Compose mantiene los datos en un volumen persistente. Reconstruye el backend
  con `docker compose up -d --build backend` cuando la tarea incluya actualizar
  la instancia local; el arranque aplica las migraciones antes de servir la API.
- No conectes PostgreSQL al exterior ni sustituyas conexiones o credenciales del
  usuario como parte de una tarea rutinaria.

## Validación y entrega

Ejecuta los comandos desde este directorio. Usa el gestor correspondiente a la
instalación existente; no mezcles npm y pnpm ni actualices lockfiles sin necesidad.

```powershell
npm run build
npm run test:unit
npx eslint "src/**/*.ts" "test/**/*.ts"
```

Para cambios de persistencia, permisos, stock o ventas, aplica primero las
migraciones a una base PostgreSQL aislada cuyo nombre termine en `_test`.
Configura `DATABASE_URL` para esa base al migrar y `TEST_DATABASE_URL` al probar;
nunca uses la conexión habitual como sustituto. Después ejecuta:

```powershell
npm run db:migrate
npm run test:e2e -- --runInBand
```

- Si cambia el seed, ejecuta también `npm run test:seed` contra una base desechable:
  esa suite borra su catálogo. Consulta los pasos de preparación del README.
- Prueba comportamientos relevantes: permisos reales, precisión monetaria,
  validaciones, concurrencia, reintentos y rollback sin escrituras parciales.
  Evita pruebas que solo reproduzcan la implementación.
- Para cambios exclusivamente documentales, revisa exactitud, rutas y comandos;
  no hace falta levantar PostgreSQL ni ejecutar toda la batería.
- No ejecutes `npm audit fix --force` indiscriminadamente. Cuando se solicite
  corregir dependencias, revisa los hallazgos actuales, compatibilidad y pruebas.
- Detén únicamente procesos y contenedores temporales que hayas creado. Conserva
  los servicios y volúmenes habituales del usuario.
- Entrega un resumen breve con qué cambió, cómo se verificó y qué quedó pendiente.
  Distingue comprobaciones realizadas de las que no pudiste ejecutar. Actualiza
  Swagger y la documentación de las APIs cuando cambien sus contratos.

## Caja y alertas operativas

- CashModule mantiene turnos por responsable e índices parciales para un turno abierto por caja/usuario. ADMIN supervisa todos, pero cada responsable opera y cierra el suyo. No borrar ni reabrir historial.
- Cobros y reembolsos usan el turno propio abierto o cashShiftId explícito; la API conserva compatibilidad con registros sin turno. Nuevos flujos Nuxt envían identificador explícito. El ledger y la operación se guardan bajo catalogWrite en un solo commit. Tarjeta/transferencia no afectan el efectivo.
- El cierre valida lastMovementId y registra contado, esperado y diferencia exactos. Los reintentos conservan UUID/actor/hash incluso después del cierre.
- /inventory/alerts descuenta reservas PENDING vigentes y excluye padres inactivos; no sustituirlo por el reporte histórico de stock físico. Ver docs/cash-and-stock-alerts-api.md.

## Auditoría, avisos y promociones

- CatalogWrite transmite el actor de sesión en contexto local a la transacción. Los triggers de auditoría capturan solo campos permitidos; no introducir hashes, tokens o binarios ni APIs para borrar/editar AuditLog. Los scripts sin sesión quedan como Proceso del sistema.
- Las transiciones notificables de Order encolan una sola vez por pedido/estado mediante trigger transaccional. El worker SMTP usa lease, reintentos limitados y Message-ID estable; la entrega externa es al menos una vez. No enviar correo dentro de la transacción de pedido.
- Promociones porcentuales se aplican solo a ventas de mostrador, una por venta, con permiso, vigencia, mínimo y versión esperados. Redondear descuento por unidad HALF_UP antes de multiplicar. Devoluciones usan unitPrice final histórico; no recalcular descuentos con promociones actuales.
- Mantener compatibilidad de hashes y ventas anteriores sin promoción. Ver docs/admin-features-api.md.
