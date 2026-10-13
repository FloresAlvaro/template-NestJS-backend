# Clientes y ventas

## Clientes

`Customer` representa al comprador, con o sin cuenta `User`. El registro público
ya crea un perfil vinculado; crear desde administración no crea credenciales ni
vincula cuentas. Clientes existentes permanecen activos tras la migración.

| Método | Ruta | Permisos |
| --- | --- | --- |
| GET | `/api/customers?search=texto&status=active&page=1&limit=20` | ADMIN, SELLER |
| GET | `/api/customers/:id` | ADMIN, SELLER |
| POST | `/api/customers` | ADMIN, SELLER |
| PATCH | `/api/customers/:id` | ADMIN |

La búsqueda considera nombre, documento y teléfono. El estado admite `all`,
`active` e `inactive`. Crear recibe `name` (2–100 caracteres), `document`
(opcional, hasta 50) y `phone` (opcional, hasta 30). Documento y teléfono se pueden
vaciar con null. PATCH también admite `isActive`. No se borran clientes para
preservar ventas y perfiles relacionados. Documento no es único en esta versión;
antes de crear, busca clientes existentes para evitar duplicados.

## Registrar una venta

ADMIN y SELLER pueden consultar y registrar ventas. CUSTOMER no accede a este
módulo; las compras en línea todavía no están implementadas. Todas las escrituras
requieren sesión válida y Origin confiable.

```json
{
  "requestId": "44d65117-dc90-437b-8fce-56e9c5eb459f",
  "customerId": 1,
  "items": [
    { "productId": 10, "quantity": 2, "expectedUnitPrice": "39.99" }
  ]
}
```

`POST /api/sales` recibe un UUID v4 nuevo por operación, un cliente activo y entre
1 y 100 productos diferentes. Las cantidades son enteros positivos. El backend
toma el precio vigente del producto: no acepta `unitPrice`, `total`, `userId`,
descuentos ni costos desde el cliente. `expectedUnitPrice` es el precio observado
en formato decimal con dos posiciones; si cambió, devuelve 409 para que el
vendedor actualice y confirme nuevamente. Cálculos y persistencia usan Decimal;
los importes se devuelven como cadenas con dos decimales, con máximo
9999999999999999.99.

En una sola transacción y bajo el bloqueo compartido del catálogo se valida que
los productos y sus padres estén activos, se verifica stock, se guarda venta y
detalle, se descuentan unidades y se registra una salida por línea. Cada salida
queda relacionada con su `SaleItem` y el usuario autenticado. No se permiten
existencias negativas; si una línea falla, no se guarda ninguna parte de la venta.
Las escrituras manuales de inventario utilizan el mismo bloqueo.

La venta guarda nombre y documento del cliente, nombre del vendedor, nombre y SKU
de cada producto, precio aplicado, cantidad y subtotal. Cambiar el catálogo o el
cliente posteriormente no modifica estos valores históricos.

### Reintentos

Reenviar el mismo `requestId`, usuario y contenido devuelve la venta original sin
volver a descontar stock. El orden de las líneas no importa. Cambiar el contenido
o el vendedor con el mismo identificador devuelve 409. La interfaz conserva el
envío si se pierde la respuesta y bloquea cambios hasta reintentarlo, usando ese
mismo identificador. Si el servidor rechaza la validación, permite corregir los
datos y realizar un nuevo envío.

### Consultar

- `GET /api/sales?page=1&limit=20&customerId=1&search=texto`: listado paginado,
  más reciente primero. Busca en nombre/documento histórico del cliente y
  SKU/nombre histórico de los productos. `customerId` es opcional.
- `GET /api/sales/:id`: detalle con precios, cantidades y total históricos.
- Historial de inventario: cada movimiento de venta incluye `saleItem.saleId`
  para abrir la venta desde la interfaz.

No existen rutas para editar o borrar ventas. Registrar una venta descuenta stock,
pero no confirma un pago ni emite factura fiscal. Los cobros, reembolsos,
anulaciones y devoluciones se documentan en [operaciones de venta](sale-operations-api.md).
Impuestos, descuentos, caja y reportes quedan para módulos posteriores.

## Interfaz

Clientes permite búsqueda, filtrado por estado, alta sin cuenta, edición y
activación/desactivación por administradores, y acceso a sus ventas. Ventas ofrece
listado, búsqueda, detalle y alta. En Nueva venta se selecciona o crea un cliente,
se buscan productos por SKU/nombre y se revisan cantidades y total antes de
confirmar. Actualizar precios y stock refresca los productos seleccionados.

## Actualización y pruebas

Docker: `docker compose up -d --build backend`; el arranque aplica migraciones
sin borrar productos, clientes, inventario ni usuarios. Sin Docker:
`npm run build`, `npm run db:migrate` y arranque habitual.

Con `TEST_DATABASE_URL` apuntando a una base aislada terminada en `_test`, ejecuta
`npm run test:e2e -- --runInBand`. La suite de ventas cubre permisos reales, clientes
sin cuenta y registrados, precios exactos e históricos, auditoría, validación,
stock insuficiente, reintentos concurrentes, sobreventa y reversión completa.
