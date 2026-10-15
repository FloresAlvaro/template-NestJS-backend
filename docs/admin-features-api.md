# Auditoría, avisos de pedidos y promociones

Todas las rutas llevan /api y conservan sesión, roles y Origin autorizado en escrituras.

## Auditoría administrativa

GET /audit (solo ADMIN) acepta page, limit, entity, entityId y actorId. Las entidades son Category, SubCategory, Product, ProductImage, User, Inventory, Supplier y Promotion. Devuelve items, total, page y limit. Cada entrada incluye responsable, fecha, entidad/ID, acción INSERT/UPDATE/DELETE y snapshots before/after. Los importes de costo/precio se guardan como cadenas exactas.

Triggers PostgreSQL insertan la auditoría en la misma transacción de la modificación. catalogWrite transmite el actor mediante AsyncLocalStorage y set_config local a la transacción; no acepta actor en el body. Los cambios sin sesión (seed, scripts, SQL directo) se identifican como Proceso del sistema. El historial comienza al aplicar esta migración; no se fabrican cambios anteriores.

Se auditan campos explícitos de catálogo, costos, precios, roles/estado/datos de usuario, mínimos de stock, proveedores y promociones. No se almacenan hashes, contraseñas, sesiones, tokens ni contenido binario de imágenes. La cantidad de stock conserva su historial específico. Las imágenes se auditan por presencia, tamaño e identificador de contenido; no se copia el binario al historial.

No hay API de modificación/borrado del historial. PostgreSQL rechaza UPDATE/DELETE de AuditLog. Esto no es una garantía criptográfica frente a un administrador de base de datos con permisos para alterar tablas o deshabilitar triggers. ActorId no tiene borrado en cascada: se conserva el responsable histórico aunque desaparezca su cuenta.

## Notificaciones de pedidos

| Ruta | Permisos / contenido |
| --- | --- |
| GET /notifications | ADMIN: todos; CUSTOMER: únicamente propios; SELLER: denegado |
| PATCH /notifications/:id/read | Marca leído únicamente un aviso del usuario actual |
| POST /notifications/:id/retry | ADMIN vuelve a poner en cola un envío sin entrega confirmada; rechaza uno enviado o con lease activo |

Listado paginado con status PENDING, SENT, FAILED o UNREAD. Devuelve items, total, unread global del alcance autorizado, page y limit. status en cada fila es el estado del pedido que originó el evento; deliveredAt/attempts/lastError describen el correo. readAt describe lectura dentro de la aplicación y es independiente de la entrega por correo. ADMIN consulta el estado de lectura del cliente.

Un trigger de cambio de estado del pedido encola CONFIRMED, READY, CANCELLED y EXPIRED en la misma transacción. La combinación orderId/status es única; reintentar una transición no crea otro evento. La expiración periódica también genera el aviso. Se incluye la cancelación de la venta vinculada que cancela el pedido. No se notifican estados históricos existentes al instalar la migración.

El worker consulta cada 15 segundos, reclama hasta diez avisos con FOR UPDATE SKIP LOCKED y lease de dos minutos, envía fuera de la transacción y persiste el resultado. Hay como máximo ocho intentos automáticos, con espera exponencial desde 30 segundos y tope de una hora entre intentos. Un fallo de SMTP conserva el aviso y no revierte el pedido. Después de agotar intentos, ADMIN puede reintentar. Reiniciar el backend no pierde la cola; un lease abandonado vuelve a ser elegible al vencer.

Se reutiliza la configuración SMTP de recuperación de contraseña mediante un helper común. ORDER_NOTIFICATIONS_ENABLED=false desactiva el worker, pero conserva avisos y cola. En NODE_ENV=test no se inicia el timer; las pruebas invocan processBatch explícitamente contra Mailpit aislado. No se envían credenciales ni notas internas de operación en el correo.

La entrega es al menos una vez. La cola evita eventos duplicados y usa Message-ID estable, pero una caída después de que SMTP acepte el mensaje y antes de guardar deliveredAt puede producir un segundo correo. Aceptado por SMTP no garantiza lectura ni llegada a la bandeja final. Mailpit local captura mensajes y no los entrega a Internet. En producción hay que configurar un proveedor SMTP real.

## Promociones y descuentos

| Ruta | Permisos |
| --- | --- |
| GET /promotions | ADMIN: todas; SELLER: activas/vigentes y allowSeller=true |
| GET /promotions/:id | Misma restricción para SELLER; ADMIN puede consultar inactivas |
| POST /promotions | ADMIN crea una promoción |
| PATCH /promotions/:id | ADMIN reemplaza su configuración e incrementa version |

El listado admite page, limit, search literal de nombre/código y available=true para solicitar únicamente promociones elegibles. El formulario contiene code (único, A-Z/0-9/guion/guion bajo, 3-40), name, percentBps (1-10000; 1000 equivale a 10%), startsAt/endsAt ISO8601 con zona, isActive, allowSeller y minSubtotal decimal con dos cifras. Fin debe ser posterior a inicio. El frontend muestra e introduce fechas en America/La_Paz.

Esta versión permite una promoción porcentual para toda la venta de mostrador. No acumula promociones ni admite descuentos arbitrarios enviados por el cliente. ADMIN puede aplicar las vigentes; SELLER solo las expresamente autorizadas. minSubtotal se compara con el importe original completo. El catálogo público y los pedidos de autoservicio conservan su precio habitual; no se modifica un pedido ya reservado para añadir descuentos.

POST /sales acepta promotionId, expectedPromotionVersion y expectedTotal juntos, además de su contrato original. Se valida nuevamente el rol, vigencia, mínimo, versión, precios, total y stock dentro de catalogWrite. Si algo cambió se rechaza sin crear una venta ni descontar stock. El hash de los payloads antiguos sin promoción conserva su representación original.

El descuento se redondea a centavos por unidad (HALF_UP), y después se multiplica por la cantidad. Ejemplo: precio 0.05 con 50% deja descuento 0.03 y precio final 0.02; tres unidades cuestan 0.06. Nuxt utiliza enteros BigInt con la misma regla para la vista previa; el servidor es la autoridad.

La venta guarda grossTotal, discountTotal y promotionSnapshot con código, nombre, porcentaje, versión y condiciones. Cada línea conserva listUnitPrice, unitDiscount, unitPrice final y subtotal. Las ventas anteriores mantienen valores originales y se presentan con descuento 0.00. Modificar/desactivar la promoción no modifica ventas previas. Devoluciones, anulaciones, cobros, reembolsos, caja y reportes trabajan con el precio neto histórico por unidad. Una promoción de 100% es válida si ADMIN la configuró explícitamente; no inventa un cobro.

## Verificación

admin-features.e2e-spec.ts comprueba sesiones/roles/Origin, actor concurrente, valores monetarios exactos, auditoría sin secretos e inmutable, rollback de catálogo cuando falla la auditoría, descuentos idempotentes, devolución al precio neto histórico, mínimos/vigencia/permisos/versiones y aislamiento/reintentos/rollback de notificaciones con SMTP real capturado en Mailpit. Las suites anteriores y seed siguen usando PostgreSQL aislado terminado en _test.

Frontend: typecheck/build y tests/promotion.test.mjs (Node 24) para redondeo exacto y conversiones de zona horaria. Las pantallas nuevas son /audit, /notifications y /promotions; nueva venta incluye la selección y detalle conserva la promoción aplicada.
