# Inventario

Ver [UML de catálogo e inventario](diagrams/uml-classes.md#catalogo-inventario),
[secuencia de confirmación de pedidos](diagrams/uml-sequences.md#confirmar-entregar)
y el [índice de diagramas](diagrams/README.md).

Cada producto tiene un inventario de unidades enteras no negativas y un stock
mínimo. La migración crea inventarios en cero para los productos existentes.
Los productos creados desde la API empiezan en cero. El seed incluye cantidades
y mínimos de ejemplo e inicializa únicamente inventarios vacíos sin movimientos
ni mínimo configurado. Registra una entrada por cada cantidad positiva, atribuida
a un administrador activo existente indicado en `SEED_ADMIN_EMAIL`. Repetirlo no
repone stock consumido ni sobrescribe inventarios ya gestionados.

## Permisos y rutas

Las rutas requieren la cookie de sesión. GET admite ADMIN y SELLER; PATCH y POST
requieren ADMIN y un Origin confiable. CUSTOMER consulta las existencias mediante
el catálogo público, sin acceso al historial ni a costos.

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `/api/products/:id/inventory` | Cantidad, mínimo y disponibilidad |
| PATCH | `/api/products/:id/inventory` | Configurar `{ "minStock": 5 }` |
| GET | `/api/products/:id/inventory/movements?page=1&limit=20` | Historial paginado, más reciente primero |
| POST | `/api/products/:id/inventory/movements` | Registrar movimiento |

Entrada de 20 unidades:

```json
{ "type": "ENTRY", "quantity": 20, "reason": "Recepción de mercadería" }
```

Salida de 3 unidades:

```json
{ "type": "EXIT", "quantity": 3, "reason": "Mercadería dañada" }
```

Ajuste: se contaron físicamente 15 unidades, cuando el sistema mostraba 17:

```json
{ "type": "ADJUSTMENT", "quantity": 15, "expectedQuantity": 17, "reason": "Conteo físico" }
```

`quantity` en un ajuste es la cantidad final, incluyendo cero. Para entradas y
salidas es un entero positivo. El máximo es 2147483647. `expectedQuantity` es
obligatorio en ajustes y opcional en otros movimientos; una cantidad desactualizada
devuelve 409 y requiere volver a consultar existencias. El frontend lo envía para
todos los movimientos. Los ajustes sin cambio se rechazan con 400.

## Consistencia e historial

El saldo y el movimiento se guardan en una sola transacción. Se usa el mismo
bloqueo transaccional de las escrituras del catálogo, compartido entre instancias.
Una salida sin existencias devuelve 409 sin modificar el saldo ni registrar un
movimiento. La base de datos también impide cantidades negativas y movimientos
con saldo o signo inconsistente.

Cada movimiento guarda tipo, variación firmada, cantidades anterior y final,
motivo, fecha y usuario autenticado. No hay rutas para editar o borrar movimientos;
las correcciones se realizan con otro movimiento. El actor no se acepta en el body.
Los productos se desactivan sin eliminar su inventario ni historial. Se permiten
correcciones de inventario de productos inactivos, por ejemplo para contar o retirar
mercadería; esto no los vuelve a habilitar en el catálogo.

Productos y catálogo incluyen `quantity`, `minStock` y `stockStatus`:
`OUT_OF_STOCK` si es cero, `LOW_STOCK` si es positivo y menor o igual al mínimo,
y `AVAILABLE` en los demás casos. El estado activo del producto es independiente.

## Interfaz y alcance

En Productos, la tabla muestra unidades y disponibilidad. El botón Inventario abre
el historial y, para administradores, las opciones de entrada, salida, ajuste y
stock mínimo. Para registrar stock inicial, utiliza una entrada con el motivo
correspondiente. Las ventas ahora descuentan stock automáticamente y generan una
salida vinculada a cada detalle; el historial permite abrir la venta. No hay
reservas, múltiples almacenes ni unidades fraccionarias.

## Actualizar y verificar

Con Docker: `docker compose up -d --build backend`. El arranque aplica las migraciones.
Sin Docker: `npm run build` y `npm run db:migrate` antes de arrancar el backend.
Las pruebas de API se ejecutan con `npm run test:e2e -- --runInBand` y una
`TEST_DATABASE_URL` aislada terminada en `_test`. Incluyen permisos reales,
validación, auditoría, ajustes, desactivación y salidas concurrentes.
