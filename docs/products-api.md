# API de productos

Cada producto pertenece a una subcategoría; la categoría se obtiene a través de
ella. Las respuestas incluyen `quantity`, `minStock` y `stockStatus` del
[inventario](inventory-api.md). Se crea en cero y se modifica únicamente mediante
movimientos de inventario, no al editar precios o campos del producto.

## Rutas

`GET /api/products?search=teclado` busca coincidencias parciales en el nombre o SKU,
sin distinguir mayúsculas. Admite hasta 150 caracteres y se combina con `status`,
`subCategoryId`, `page` y `limit`. El total y la paginación se calculan sobre todos
los resultados filtrados. Una búsqueda vacía mantiene el listado sin búsqueda.

El parámetro `availability` admite `all` (predeterminado), `AVAILABLE` (cantidad
mayor al mínimo), `LOW_STOCK` (cantidad positiva menor o igual al mínimo) y
`OUT_OF_STOCK` (cantidad cero). Se combina con búsqueda, estado, subcategoría y
paginación. La disponibilidad se calcula con el mínimo propio de cada producto.

| Método | Ruta                         | Resultado                               |
| ------ | ---------------------------- | --------------------------------------- |
| POST   | `/api/products`              | Crear producto activo (201)             |
| GET    | `/api/products`              | Listar con paginación (200)             |
| GET    | `/api/products/:id`          | Consultar producto (200)                |
| PATCH  | `/api/products/:id`          | Actualizar campos (200)                 |
| DELETE | `/api/products/:id`          | Desactivar sin borrar físicamente (200) |
| PATCH  | `/api/products/:id/activate` | Reactivar (200)                         |

Swagger en `/docs` contiene los DTO y esquemas de respuesta. Las consultas requieren
ADMIN o SELLER, y las escrituras ADMIN y un Origin confiable. El costo se oculta a
vendedores. Los clientes consultan `/api/shop/products`, que no expone costos.

## Crear

```json
{
  "subCategoryId": 1,
  "name": "Teclado USB",
  "sku": "TEC-001",
  "barcode": "0123456789012",
  "description": "Teclado en español",
  "cost": "80.00",
  "salePrice": "120.50"
}
```

- SKU obligatorio, único, recortado y convertido a mayúsculas. Admite letras
  ASCII, números, puntos, guiones y guiones bajos; máximo 64 caracteres.
- Código de barras opcional, único cuando existe, sensible a mayúsculas; se
  conserva como texto para mantener ceros iniciales. Máximo 64 caracteres,
  letras ASCII, números o guiones. No se exige una longitud EAN/UPC específica.
- Nombre de 3 a 150 caracteres y descripción opcional de hasta 1000, recortados.
- `cost` y `salePrice` son textos decimales no negativos, con hasta 16 dígitos
  enteros y 2 decimales. Ejemplos válidos: `"0"`, `"0.10"`, `"120.50"`.
  No se aceptan números JSON, notación científica ni más decimales. PostgreSQL
  almacena `Decimal(18,2)` y la API responde con dos decimales: `"0.00"`.
- Se permite precio cero o por debajo del costo; no se impone una regla de margen.
- La subcategoría y su categoría deben existir y estar activas.

## Actualizar y activar

Todos los campos del POST son opcionales en PATCH. Los campos obligatorios
no aceptan `null`; `barcode: null` y `description: null` limpian esos valores.
El estado solo se modifica mediante DELETE o la ruta de activación.

Las validaciones y el cambio se ejecutan en una transacción. Un error por duplicado
o subcategoría inválida no modifica otros campos. SKU y código de barras siguen
reservados después de desactivar el producto. Cambiar de subcategoría requiere
un destino activo. Reactivar requiere subcategoría y categoría activas.

No se puede desactivar una subcategoría con productos activos; primero deben
moverse o desactivarse sus productos. Una segunda baja o activación devuelve 409.

## Listar

`GET /api/products?status=active&subCategoryId=1&page=1&limit=20`

`status`: `all` (predeterminado), `active` o `inactive`. `page` comienza en 1;
`limit` va de 1 a 100 (predeterminado 20). Orden estable por ID ascendente.
Una subcategoría de filtro inexistente devuelve 404.

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "limit": 20
}
```

Errores: 400 para entradas inválidas o campos desconocidos, 404 para recursos
inexistentes y 409 para identificadores duplicados o conflictos de activación.

## Base de datos

La migración `20261012160000_products` agrega Product y su clave foránea sin
alterar las categorías existentes. Incluye índices únicos de SKU y código de barras,
índice `(subCategoryId, isActive)` y restricciones SQL de importes no negativos y
SKU canónico. El borrado físico de subcategorías con productos queda restringido.
