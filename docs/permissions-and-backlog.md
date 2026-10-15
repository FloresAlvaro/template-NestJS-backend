# Permisos y pendientes — 14 de octubre de 2026

Ver [flujo de permisos](flowcharts.md#1-permisos-de-una-petición),
[UML de usuarios y sesiones](diagrams/uml-classes.md#usuarios-sesiones)
y el [índice de diagramas](diagrams/README.md).

## Resultado

El backend declara actualmente **90 rutas en 18 controladores**. Reportes incluye
siete lecturas exclusivas de ADMIN. Imágenes de gestión permite GET a ADMIN/SELLER
y POST/DELETE a ADMIN; la lectura pública valida la activación de todos los padres.
Recuperación de contraseña y pedidos están integrados con Nuxt. Ver
[pedidos](orders-api.md), [reportes](reports-api.md),
[recuperación](password-recovery-api.md) e [imágenes](product-images-api.md).

La revisión inicial de 49 rutas se conserva abajo como evidencia histórica;
no equivale a una comprobación HTTP exhaustiva de las rutas actuales.

El guard global permite GET/HEAD/OPTIONS a ADMIN y SELLER, y el resto de métodos
solo a ADMIN, salvo decoradores explícitos. La metadata del método prevalece
sobre la del controlador. No tener `@Roles` no significa que una ruta sea pública.
Todas las escrituras, incluso login y registro, exigen un Origin autorizado.
Las rutas privadas exigen sesión vigente de un usuario activo.

## Matriz de rutas

Todas las rutas de esta tabla llevan el prefijo `/api`.

| Rutas | Lecturas | Escrituras |
| --- | --- | --- |
| `/categories`, `/categories/:id`, `/categories/:id/sub-categories` | ADMIN/SELLER | ADMIN: POST raíz, PATCH por ID, PATCH `:id/activate`, DELETE por ID |
| `/sub-categories`, `/sub-categories/:id` | ADMIN/SELLER | ADMIN: POST raíz, PATCH por ID, PATCH `:id/activate`, DELETE por ID |
| `/products`, `/products/:id` | ADMIN/SELLER; costo visible solo a ADMIN | ADMIN: POST raíz, PATCH por ID, PATCH `:id/activate`, DELETE por ID |
| `/products/:id/inventory` y `/movements` relativo | ADMIN/SELLER | ADMIN: PATCH inventario y POST movimientos |
| `/cash/registers` | ADMIN/SELLER | ADMIN: crear/modificar cajas |
| `/cash/shifts` y detalle/movimientos | ADMIN: todos; SELLER: propios | ADMIN/SELLER: abrir turno propio, movimientos y cierre propios |
| `/inventory/alerts` | ADMIN/SELLER, sin costos | No existen |
| `/customers`, `/customers/:id` | ADMIN/SELLER | POST: ADMIN/SELLER; PATCH por ID: ADMIN |
| `/sales`, `/sales/:id` | ADMIN/SELLER | POST raíz y `:id/payments`: ADMIN/SELLER; `:id/refunds`, `:id/returns`, `:id/cancel`: ADMIN |
| `/orders`, `/orders/:id` | ADMIN/SELLER: todos; CUSTOMER: propios | POST raíz: CUSTOMER; `:id/confirm`, `:id/ready`, `:id/complete`: ADMIN/SELLER; `:id/cancel`: ADMIN/SELLER y CUSTOMER propietario, solo PENDING |
| `/users` | ADMIN | ADMIN: POST raíz, PATCH `:id`, POST `:id/password` |
| `/suppliers`, `/suppliers/:id` | ADMIN | ADMIN: POST raíz, PATCH por ID (incluye baja lógica) |
| `/purchases`, `/purchases/:id` | ADMIN | ADMIN: POST raíz, `:id/receive`, `:id/cancel` |
| `/auth/me` | ADMIN/SELLER/CUSTOMER | — |
| `/auth/profile`, `/auth/password`, `/auth/logout` | — | ADMIN/SELLER/CUSTOMER, sobre su propia sesión/cuenta |
| `/auth/customer` | CUSTOMER, perfil propio | PATCH: CUSTOMER, perfil propio |
| `/auth/login`, `/auth/register` | — | Públicas, con Origin autorizado y límite de intentos; registro fija CUSTOMER |
| `/shop/products`, `/shop/products/:id` | Públicas, solo catálogo activo y sin costos | No existen |
| `/products/:id/image` | ADMIN/SELLER | POST/DELETE: ADMIN |
| `/shop/products/:id/image` | Pública, solo catálogo activo | No existen |
| `/reports/sales`, `/reports/top-products`, `/reports/sales-series`, `/reports/sellers`, `/reports/payment-methods`, `/reports/inventory`, `/reports/low-stock` | ADMIN | No existen |
| `/auth/forgot-password`, `/auth/reset-password` | GET reset-password: formulario público | POST: públicas, con Origin y límite de intentos |
| `/health` | Pública | No existen |

SELLER puede consultar todas las ventas, clientes e historial de inventario,
no solamente sus propios registros. Esto coincide con la política vigente; un
aislamiento por vendedor o sucursal requeriría nuevas reglas de negocio.
CUSTOMER puede comprar y consultar sus pedidos mediante `/orders`, con un resumen seguro del saldo de su venta vinculada. No puede consultar directamente `/sales` ni registrar cobros.

## Observaciones

- Swagger en `/docs` se monta fuera de los controladores de Nest y es público;
  `AccessGuard` no lo protege. Incluye la documentación de rutas administrativas,
  pero no permite ejecutarlas sin sus permisos. Definir su exposición al publicar.
- `ShopService` devuelve `quantity`, `minStock` y `stockStatus` mediante
  `withStock`. No expone costos ni credenciales, pero `minStock` es un umbral
  operativo. Definir qué información de existencias debe ver el público antes
  de modificar el contrato y coordinarlo con el frontend.
- Swagger declara autenticación por cookie de forma incompleta en categorías,
  subcategorías y productos. Esto afecta a la documentación, no al guard real.
- Las pruebas de catálogo que sustituyen el guard no prueban permisos. Ya hay
  suites de autenticación, inventario y ventas con sesiones reales; conviene
  completar una matriz HTTP exhaustiva por ruta y rol.

## Pendientes y propuestas

El listado distingue funciones implementadas de pendientes. No autoriza su
implementación ni presupone que todos formen parte del alcance del producto.

| Prioridad sugerida | Trabajo | Estado / alcance |
| --- | --- | --- |
| Alta, antes de publicar | Resolver dependencias vulnerables restantes | Ver `dependency-security.md`; evitar retrocesos incompatibles de Prisma/Jest |
| Alta, antes de publicar | Límite centralizado de login/registro | El actual es local a cada proceso; diseñar proxy de confianza sin habilitar `trust proxy` indiscriminadamente |
| Alta, antes de publicar | Política de exposición de Swagger y stock público | Resolver las observaciones anteriores y documentar los contratos elegidos |
| Alta, antes de publicar | Operación de producción | Configurar HTTPS, correo real, monitoreo, copias de seguridad y verificar restauración |
| Media | Automatización frontend y CI | Frontend dispone de typecheck/build y revisión manual; no hay suite automatizada de navegador ni workflows CI versionados |
| Alta | Completar pruebas HTTP de permisos por ruta y rol | Incluir usuario anónimo, sesión vencida/revocada, Origin y aislamiento del perfil |
| Implementado localmente | Recuperación de contraseña por correo | SMTP/Mailpit y pantallas Nuxt implementados; proveedor de producción y estrategia de entrega/reintentos pendientes |
| Implementado parcialmente | Compras de autoservicio | Pedidos CUSTOMER, reservas, retiro y cobros manuales disponibles; carrito persistente, envíos, pasarela y notificaciones pendientes |
| Alta | Búsqueda y filtros del catálogo público | Actualmente solo paginación; búsqueda, categoría, precio y disponibilidad pendientes |
| Implementado | Caja: apertura, cierre y arqueo | Turnos por responsable, movimientos, métodos separados y cierres auditados; ver [contrato](cash-and-stock-alerts-api.md). Cierre por supervisor y conciliación bancaria pendientes |
| Implementado | Alertas operativas de stock | Disponibilidad descontando reservas, aviso en Inicio y vista filtrable; correo/push pendientes |
| Implementado | Reportes de ventas y existencias | Siete endpoints y seis gráficos Nuxt con tablas exactas y filtros; exportaciones, metas y rentabilidad pendientes |
| Media | Comprobantes y exportaciones | Impresión de comprobantes comerciales y descarga CSV/PDF pendientes; no equivalen a facturación fiscal |
| Implementado | Proveedores, compras y recepción | ADMIN: compras pendientes, recepción completa idempotente con entradas auditadas y costos opcionales; ver [contrato](purchases-api.md). Parciales, devoluciones y cuentas por pagar pendientes |
| Según necesidad comercial | Descuentos e impuestos | No incluidos actualmente; requieren reglas monetarias e historial |
| Según necesidad comercial | Facturación fiscal y notas de crédito | No implementadas; definir requisitos e integración antes de diseñar |
| Según necesidad comercial | Pasarela de pagos | No implementada; requiere conciliación, webhooks e idempotencia externa |
| Según necesidad comercial | Sucursales, moneda múltiple o productos por peso | Fuera del modelo actual; requieren rediseño explícito |
| Implementado por solicitud | Imágenes de productos | Una foto validada por producto en PostgreSQL; catálogo y carga/reemplazo/eliminación en Nuxt implementados |

Inventario, sesiones, roles, clientes, ventas, cobros manuales, reembolsos,
devoluciones y anulaciones ya están implementados: no son pendientes.

## Comprobaciones realizadas

- Inspección de los controladores, `AuthModule`, `AppModule`, `AccessGuard`,
  servicios de autenticación y catálogo público, esquema y pruebas existentes.
- 196 comprobaciones de acceso: las 49 rutas con anónimo, ADMIN, SELLER y
  CUSTOMER, ejecutando el guard real y metadata de controladores compilados,
  con sesiones simuladas. Todas correctas.
- Esta revisión no ejecutó HTTP ni PostgreSQL; las comprobaciones anteriores
  no sustituyen las suites e2e con sesiones persistidas. No se cambiaron permisos,
  contratos ni reglas de negocio.
