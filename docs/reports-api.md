# Reportes de ventas e inventario

Todas las rutas requieren sesión ADMIN. SELLER y CUSTOMER reciben 403; sin
sesión se recibe 401. No modifican ventas, cobros ni existencias.

## Ventas y productos más vendidos

- `GET /api/reports/sales?from=2026-10-01T00:00:00Z&to=2026-11-01T00:00:00Z`
- `GET /api/reports/top-products` con los mismos parámetros.

`from` y `to` son obligatorios: fechas ISO 8601 con hora y zona explícita (`Z` o
desplazamiento). Se incluye `from` y se excluye `to`; el intervalo debe ser
positivo y de como máximo 366 días. Los parámetros extra se rechazan.
Para un día local en Bolivia puede utilizarse, por ejemplo,
`from=2026-10-13T00:00:00-04:00&to=2026-10-14T00:00:00-04:00`.
Codificar los valores con URLSearchParams, especialmente los offsets con `+`.

Se seleccionan ventas por su fecha de creación y se consideran **todas sus
operaciones registradas al consultar**, incluso las posteriores a `to`. Es un
reporte del estado actual de las ventas de ese período, no una reconstrucción
del saldo histórico al cierre ni un reporte de movimientos de caja del período.

El resumen devuelve `from`, `to`, `saleCount`, `originalTotal`, `adjustedTotal`,
`paid`, `refunded`, `balanceDue` y `refundDue`. Los importes son cadenas con dos
decimales. Los saldos se calculan por venta antes de sumarse: una venta con
dinero a devolver no compensa otra con deuda. Las anulaciones mantienen el total
original y llevan el ajustado a cero. Un intervalo vacío devuelve ceros.
Las sumas usan aritmética decimal de PostgreSQL, sin coma flotante en JavaScript.

El ranking devuelve `from`, `to`, `limit: 100` e `items` con `productId`, `sku`,
`productName`, `quantity` y `netTotal`. Se restan unidades e importes devueltos o
repuestos por anulación y se omiten resultados con cero unidades netas. Se ordena
por cantidad neta descendente, con desempate estable. Los nombres y SKU son los
históricos; si cambiaron, el mismo producto puede aparecer en filas distintas.
`quantity` es una cadena entera para preservar sumas superiores al rango seguro
de JavaScript. `netTotal` es una cadena decimal de dos posiciones. No son ganancias:
no existe costo histórico de venta para calcular margen fiable.

## Inventario

- `GET /api/reports/inventory`: `productCount`, `outOfStock`, `lowStock`,
  `available` y `quantity` (cadena entera con unidades totales).
- `GET /api/reports/low-stock?page=1&limit=20`: respuesta paginada habitual
  `{ items, total, page, limit }`. Cada fila incluye `productId`, `name`, `sku`
  e `inventory: { quantity, minStock } | null`.

Solo se consideran productos activos con categoría y subcategoría activas.
Sin fila de inventario se interpreta stock cero. `lowStock` cuenta cantidades
positivas menores o iguales al mínimo; `outOfStock` cuenta cero. El listado de
alertas incluye ambos casos. La paginación mantiene los límites compartidos y
consulta filas y conteo en una transacción RepeatableRead. No se exponen costos.

## Integración

Son rutas nuevas; no cambian los contratos de ventas existentes. El frontend
todavía no tiene pantallas de reportes añadidas por este cambio. Swagger incluye
las rutas, autenticación por cookie y los parámetros de período/paginación.
