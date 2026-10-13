# Permisos y pendientes — 13 de octubre de 2026

## Resultado

Actualización posterior a la revisión inicial: se añadieron cuatro rutas de
reportes exclusivas de ADMIN, tres rutas de imágenes de gestión (GET para
ADMIN/SELLER y POST/DELETE para ADMIN), y una lectura pública de imágenes que
valida la activación de todos los padres. La recuperación local agrega dos POST
públicos con Origin y límite de intentos, y un GET de formulario independiente.
Ahora hay 60 rutas. Ver
[reportes](reports-api.md) e [imágenes](product-images-api.md).

Se revisaron las 49 rutas declaradas por los 10 controladores, el registro global
de `AccessGuard`, los decoradores y el acceso al perfil propio. No se detectaron
rutas de negocio sin la autorización exigida por las reglas actuales.

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
| `/customers`, `/customers/:id` | ADMIN/SELLER | POST: ADMIN/SELLER; PATCH por ID: ADMIN |
| `/sales`, `/sales/:id` | ADMIN/SELLER | POST raíz y `:id/payments`: ADMIN/SELLER; `:id/refunds`, `:id/returns`, `:id/cancel`: ADMIN |
| `/users` | ADMIN | ADMIN: POST raíz, PATCH `:id`, POST `:id/password` |
| `/auth/me` | ADMIN/SELLER/CUSTOMER | — |
| `/auth/profile`, `/auth/password`, `/auth/logout` | — | ADMIN/SELLER/CUSTOMER, sobre su propia sesión/cuenta |
| `/auth/customer` | CUSTOMER, perfil propio | PATCH: CUSTOMER, perfil propio |
| `/auth/login`, `/auth/register` | — | Públicas, con Origin autorizado y límite de intentos; registro fija CUSTOMER |
| `/shop/products`, `/shop/products/:id` | Públicas, solo catálogo activo y sin costos | No existen |
| `/health` | Pública | No existen |

SELLER puede consultar todas las ventas, clientes e historial de inventario,
no solamente sus propios registros. Esto coincide con la política vigente; un
aislamiento por vendedor o sucursal requeriría nuevas reglas de negocio.
CUSTOMER no tiene rutas para consultar ventas ni comprar por autoservicio.

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

Los siguientes elementos no están implementados. Este listado no autoriza su
implementación ni presupone que todos formen parte del alcance del producto.

| Prioridad sugerida | Trabajo | Estado / alcance |
| --- | --- | --- |
| Alta, antes de publicar | Resolver dependencias vulnerables restantes | Ver `dependency-security.md`; evitar retrocesos incompatibles de Prisma/Jest |
| Alta, antes de publicar | Límite centralizado de login/registro | El actual es local a cada proceso; diseñar proxy de confianza sin habilitar `trust proxy` indiscriminadamente |
| Alta, antes de publicar | Política de exposición de Swagger y stock público | Resolver las observaciones anteriores y documentar los contratos elegidos |
| Alta | Completar pruebas HTTP de permisos por ruta y rol | Incluir usuario anónimo, sesión vencida/revocada, Origin y aislamiento del perfil |
| Implementado localmente | Recuperación de contraseña por correo | SMTP y Mailpit con formulario independiente; proveedor de producción e integración Nuxt pendientes |
| Media | Compras de autoservicio | Pendiente explícito; diseñar carrito/pedido, reservas o descuento de stock y permisos CUSTOMER |
| Media | Caja: apertura, cierre y conciliación | Propuesta; los cobros actuales son registros manuales |
| Implementado | Reportes de ventas y existencias | Resumen, ranking neto y alertas de stock; exportaciones y pantallas siguen pendientes |
| Media | Proveedores, compras y recepción | Propuesta; actualmente hay entradas manuales de inventario |
| Según necesidad comercial | Descuentos e impuestos | No incluidos actualmente; requieren reglas monetarias e historial |
| Según necesidad comercial | Facturación fiscal y notas de crédito | No implementadas; definir requisitos e integración antes de diseñar |
| Según necesidad comercial | Pasarela de pagos | No implementada; requiere conciliación, webhooks e idempotencia externa |
| Según necesidad comercial | Sucursales, moneda múltiple o productos por peso | Fuera del modelo actual; requieren rediseño explícito |
| Implementado por solicitud | Imágenes de productos | Una foto validada por producto, persistida en PostgreSQL; integración frontend pendiente |

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
