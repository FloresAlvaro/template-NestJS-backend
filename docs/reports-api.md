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
por cantidad neta descendente de forma predeterminada. El parámetro opcional
`metric=UNITS|AMOUNT` permite ordenar por unidades o importe neto, con desempate
estable. La selección se aplica en SQL antes del límite: no es un reordenamiento
de una página previamente limitada. Los nombres y SKU son los
históricos; si cambiaron, el mismo producto puede aparecer en filas distintas.
`quantity` es una cadena entera para preservar sumas superiores al rango seguro
de JavaScript. `netTotal` es una cadena decimal de dos posiciones. No son ganancias:
no existe costo histórico de venta para calcular margen fiable.

## Inventario

- `GET /api/reports/inventory`: `productCount`, `outOfStock`, `lowStock`,
  `available` y `quantity` (cadena entera con unidades totales).
- `GET /api/reports/low-stock?page=1&limit=20`: respuesta paginada habitual
  `{ items, total, page, limit }`. Cada fila incluye `productId`, `name`, `sku`
  e `inventory: { quantity, minStock } | null`, más `reservedQuantity` y
`availableQuantity`. Las reservas incluyen únicamente pedidos PENDING no vencidos;
la disponibilidad es `max(0, quantity - reservedQuantity)`.

Solo se consideran productos activos con categoría y subcategoría activas.
Sin fila de inventario se interpreta stock cero. `lowStock` cuenta cantidades
positivas menores o iguales al mínimo; `outOfStock` cuenta cero. El listado de
alertas incluye ambos casos. La paginación mantiene los límites compartidos y
consulta filas y conteo en una transacción RepeatableRead. No se exponen costos.

## Integración

El frontend muestra seis gráficos y tablas desplegables con valores exactos:
evolución, top 10 productos, top 10 vendedores, métodos de pago, estado físico del
inventario y stock frente al mínimo. Las fechas, agrupación, métrica de ranking
y página de alertas se conservan en la URL. Cada gráfico contempla carga, vacío,
error y reintento; las tablas permiten consultar hasta 100 resultados de ranking.
Swagger documenta las rutas, autenticación por cookie y parámetros.

## Evolución de ventas

`GET /api/reports/sales-series?from=...&to=...&group=DAY`

Acepta el mismo período de hasta 366 días y `group=DAY|MONTH` (DAY por defecto).
Devuelve `from`, `to`, `group`, `timeZone: America/La_Paz` e `items` ordenados por
fecha. Cada elemento tiene `date` (`YYYY-MM-DD`, primer día del grupo),
`saleCount`, `originalTotal` y `adjustedTotal` como cadenas decimales. En grupos
sin ventas se devuelven ceros. Las fechas se agrupan por el calendario de Bolivia,
no por medianoche UTC. Los extremos parciales incluyen solo ventas dentro del
intervalo, aunque la etiqueta sea el primer día del mes.

`adjustedTotal` utiliza exactamente los mismos saldos actuales que `/sales`:
resta devoluciones y anulaciones, incluso posteriores al período. La suma de la
serie coincide con el resumen si se consulta el mismo estado de la base.
No representa caja recibida, ganancias ni un saldo histórico al cierre.

## Ventas por vendedor

`GET /api/reports/sellers?from=...&to=...`

Devuelve `from`, `to`, `limit: 100`, `total` (vendedores del período antes del
límite) e `items`: `userId`, `sellerName`, `saleCount`, `originalTotal` y
`adjustedTotal`. Se agrupa por ID y se ordena por ventas netas descendentes con
desempate por ID. Un cambio de nombre no divide al vendedor: se muestra su último
nombre histórico dentro del período. Se conserva el historial de vendedores
ahora inactivos o con otro rol. Los importes no son comisiones ni utilidad.

## Cobros por método de pago

`GET /api/reports/payment-methods?from=...&to=...`

Devuelve `from`, `to` e `items` con `method`, `paymentCount` y `amount` decimal.
Siempre incluye CASH, CARD y TRANSFER, con ceros cuando no tienen movimientos.
Solo cuenta operaciones PAYMENT por su propia `createdAt` en `[from, to)`,
incluso si la venta es anterior, fue anulada o recibió una devolución.
Son cobros brutos; los REFUND no se incluyen ni se restan. No hay un método QR
independiente. El resultado puede diferir de `paid` de `/sales`, que selecciona
ventas por fecha de creación y considera todos sus cobros registrados hasta hoy.

## Semántica de stock en los gráficos

La dona cuenta productos por estado de stock físico. `available` del resumen
histórico significa cantidad de productos por encima de su mínimo, no unidades
libres de reservas. La interfaz lo llama Normal · sobre el mínimo.

Stock frente al mínimo representa hasta 10 productos de la página actual de
alertas, con las cantidades físicas y mínimas; también muestra reservas y
unidades disponibles. No pretende representar todo el catálogo ni el stock
histórico del período. Las tablas de la página conservan 20 alertas paginadas.

Estas consultas son de solo lectura y exigen ADMIN; no crean ni modifican
ventas, cobros, pedidos o movimientos de stock. Los agregados conservan precisión
decimal en PostgreSQL y la visualización normaliza geometría con BigInt antes de
convertir proporciones a Number. Las tablas y etiquetas mantienen cifras exactas;
las marcas de eje excepcionalmente grandes usan notación científica aproximada.
