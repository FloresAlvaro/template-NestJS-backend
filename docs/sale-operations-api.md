# Cobros, reembolsos, devoluciones y anulaciones

Todas las rutas requieren sesión y un Origin autorizado. No existe edición ni
borrado de operaciones. El detalle y listado de ventas incluyen `status` (ACTIVE,
PARTIALLY_RETURNED, RETURNED, CANCELLED), `paid`, `refunded`, `adjustedTotal`,
`balanceDue`, `refundDue` y `operations`. Los importes son cadenas decimales con
dos decimales. Cada artículo incluye `returnedQuantity` (también incluye unidades
repuestas por anulación). El total y precio originales permanecen intactos.

## Rutas

- `POST /api/sales/:id/payments`: ADMIN/SELLER. Body: `requestId` UUID v4,
  `reason` de 3 a 500 caracteres, `amount` positivo con dos decimales y `method`
  CASH, CARD o TRANSFER. Admite cobros parciales; rechaza importes mayores al saldo.
- `POST /api/sales/:id/refunds`: ADMIN. Mismo body. Solo permite devolver dinero
  que esté pendiente de reembolso tras una devolución o anulación.
- `POST /api/sales/:id/returns`: ADMIN. Body: `requestId`, `reason`, `items`
  (1–100 elementos con `saleItemId` y `quantity` entera positiva). Rechaza artículos
  ajenos, duplicados y cantidades superiores a lo aún no devuelto. Usa precios
  originales, incluso si el producto cambió de precio o fue desactivado.
- `POST /api/sales/:id/cancel`: ADMIN. Body: `requestId`, `reason`. Repone solamente
  las unidades aún no devueltas y deja total vigente cero. Es definitiva.

Todas devuelven el detalle actualizado de la venta. Repetir el mismo UUID con el
mismo usuario y payload devuelve el estado actual sin duplicar efectos; reutilizarlo
para otra operación devuelve 409. Cambiar la operación requiere un UUID nuevo.

## Reglas

Las operaciones se serializan con el mismo bloqueo transaccional del inventario:
ninguna combinación concurrente puede sobrecobrar, sobredevolver o reponer dos veces.
Cada devolución/anulación registra entradas de inventario vinculadas a sus líneas,
con usuario, cantidades anteriores/posteriores y motivo. Su historial incluye
`operationItem.operation.saleId` para abrir la venta correspondiente.

`adjustedTotal = total original - valor de artículos repuestos` (cero al anular).
`balanceDue = max(0, adjustedTotal - (paid - refunded))`.
`refundDue = max(0, (paid - refunded) - adjustedTotal)`.
Una devolución puede primero reducir una deuda y solo generar reembolso por el
exceso efectivamente cobrado. No se cobra una venta anulada o sin saldo.

Los cobros/reembolsos son **registros manuales de dinero recibido o devuelto por
fuera del sistema**. No hay conexión con bancos ni procesador de tarjeta. Anular o
devolver productos no envía dinero automáticamente: el administrador debe efectuar
y registrar el reembolso pendiente. No incluye facturación fiscal, cierre de caja,
impuestos, descuentos ni notas de crédito legales.

## Actualización y pruebas

`docker compose up -d --build backend` aplica la migración aditiva
`20261012220000_sale_operations`. Conserva ventas, productos y existencias actuales.
Las ventas anteriores comienzan sin operaciones; no se presume que estén cobradas.

Con `TEST_DATABASE_URL` apuntando a una base aislada terminada en `_test`, ejecuta
`npm run test:e2e -- --runInBand`. La suite verifica cobros parciales, precisión,
permisos, reintentos concurrentes, sobrecobro, devolución parcial/total, anulación
después de devolución, reembolsos, precios históricos, stock máximo y reversión
completa de transacciones fallidas.
