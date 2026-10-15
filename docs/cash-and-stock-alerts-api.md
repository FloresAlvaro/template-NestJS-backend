# Caja, turnos y alertas de stock

Las rutas llevan el prefijo /api, requieren sesión ADMIN/SELLER y Origin autorizado en escrituras. Los importes son cadenas con dos decimales; no hay procesamiento bancario.

## Caja y turnos

| Ruta | Operación |
| --- | --- |
| GET /cash/registers | Cajas; SELLER recibe únicamente las activas |
| POST /cash/registers | ADMIN crea { name, isActive? } |
| PATCH /cash/registers/:id | ADMIN modifica { name, isActive? }; bloqueado mientras haya turno abierto |
| GET /cash/shifts | Historial paginado: page, limit, status OPEN/CLOSED, registerId opcional |
| GET /cash/shifts/current | Turno propio abierto con resumen, o null |
| POST /cash/shifts | Apertura: { requestId UUIDv4, registerId, openingAmount } |
| GET /cash/shifts/:id | Detalle y resumen exacto por método de pago |
| GET /cash/shifts/:id/movements | Movimientos paginados, con referencia a la venta cuando corresponde |
| POST /cash/shifts/:id/movements | { requestId, kind CASH_IN/CASH_OUT, amount, reason } |
| POST /cash/shifts/:id/close | { requestId, countedAmount, expectedLastMovementId, reason } |

Se crea una Caja principal mediante migración, sin abrir turnos ni alterar ventas existentes.
Una caja y un usuario pueden tener un solo turno abierto. ADMIN consulta todos; SELLER solo los propios. Únicamente el responsable registra movimientos y cierra su turno, incluso si otro ADMIN lo supervisa. No hay borrado ni reapertura de turnos cerrados.

Aperturas, movimientos y cierres conservan UUID, actor y hash del contenido. Reintentar el mismo contenido devuelve el registro previo, incluso después del cierre; cambiarlo devuelve 409. Las escrituras comparten catalogWrite con ventas, pedidos e inventario. Restricciones e índices parciales refuerzan las reglas en PostgreSQL.

El efectivo esperado es: apertura + cobros CASH - reembolsos CASH + ingresos manuales - retiros manuales. Tarjeta y transferencia se presentan por separado como cobros menos reembolsos; no aumentan el efectivo. Se impiden saldos negativos y desbordamientos. El cierre guarda efectivo esperado, contado, diferencia (contado menos esperado), fecha y motivo. expectedLastMovementId debe coincidir con summary.lastMovementId; si hubo movimientos nuevos, devuelve 409 y exige actualizar y revisar el arqueo.

## Integración con cobros y reembolsos

POST /sales/:id/payments y /refunds aceptan cashShiftId opcional. Si se indica, debe ser un turno propio abierto; si se omite, se utiliza el turno propio abierto cuando exista. Cobro/reembolso y movimiento de caja se guardan en la misma transacción, una sola vez. Un reembolso CASH necesita efectivo suficiente en ese turno. Los permisos originales permanecen: SELLER cobra; solo ADMIN reembolsa.

Por compatibilidad, la API conserva los registros sin turno cuando se omite cashShiftId y no existe turno abierto. Las operaciones históricas y el seed permanecen sin asignar y no se suman a un turno nuevo. No se recalculan ni trasladan cobros antiguos. La interfaz Nuxt exige abrir turno y envía cashShiftId explícito para los nuevos cobros y reembolsos. El historial de ventas expone cashMovement: { shiftId } o null. Los clientes externos que deban exigir caja también deben enviar el identificador explícito.

## Alertas operativas

GET /inventory/alerts permite page, limit (máximo 100), search (SKU/nombre literal, máximo 150) y severity OUT_OF_STOCK/LOW_STOCK. Devuelve data, total filtrado, page, limit, asOf y summary global { total, outOfStock, lowStock }. No expone costos.

Se incluyen solo productos, subcategorías y categorías activos. El stock disponible es max(0, físico - reservas de pedidos PENDING con expiresAt mayor que asOf). OUT_OF_STOCK: disponible cero; LOW_STOCK: disponible positivo menor o igual al mínimo. Un producto completamente reservado puede estar agotado aunque aún tenga unidades físicas. Las reservas vencidas dejan de afectar la consulta automáticamente.

Cada fila incluye físico, reservado, disponible, mínimo, categoría/subcategoría y suggestedQuantity = minStock + 1 - availableQuantity, suficiente para superar el mínimo. Es una sugerencia, no crea compras ni movimientos. Un mínimo igual al máximo de inventario debe reducirse para poder superar ese umbral.

Son alertas calculadas al consultar, sin persistencia de notificaciones ni correo/push. Nuxt muestra el aviso en Inicio y la vista /stock-alerts con búsqueda, filtros, inventario y acceso ADMIN a nuevas compras. Refresca cada minuto y al recuperar el foco. El reporte ADMIN /reports/low-stock conserva su contrato previo basado en stock físico.

## Verificación

La suite test/cash-alerts.e2e-spec.ts utiliza PostgreSQL desechable terminado en _test. Cubre sesiones, roles, Origin, aislamiento, concurrencia de reintentos, arqueo obsoleto, precisión decimal, límites, cash/card/transfer, reembolsos, rollback ante fallo de auditoría, reservas vigentes/vencidas, reposición, padres inactivos, paginación y búsqueda literal.
