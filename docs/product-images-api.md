# Imágenes de productos

Se admite una imagen por producto, almacenada en `ProductImage` en PostgreSQL.
La migración `20261013170000_product_images` crea una tabla nueva sin modificar
productos ni datos existentes. Las imágenes forman parte del respaldo de la base;
no se necesitan credenciales de terceros ni un volumen adicional para archivos.
Esta solución inicial aumenta el tamaño de la base; para catálogos grandes puede
migrarse a almacenamiento de objetos con un contrato explícito.

## Rutas

- `POST /api/products/:id/image`: ADMIN y Origin autorizado. Multipart con un
  único campo de archivo `file`, sin otros campos. Máximo 5 MiB de entrada.
  Crea o reemplaza la imagen y devuelve `{ productId, imageUrl }`, estado 201.
- `DELETE /api/products/:id/image`: ADMIN y Origin autorizado. Elimina la foto,
  no el producto. Devuelve `{ productId, imageUrl: null }`; repetirlo es seguro.
- `GET /api/products/:id/image`: ADMIN/SELLER; permite productos inactivos.
- `GET /api/shop/products/:id/image`: pública, solo si producto, subcategoría y
  categoría están activos. En los demás casos devuelve 404.

Las lecturas devuelven bytes `image/webp`, `Cache-Control: no-store` y
`X-Content-Type-Options: nosniff`. Si no existe imagen, devuelven 404.
Un ID inválido devuelve 400; producto inexistente, 404. Sin sesión en rutas de
gestión, 401; rol no permitido u Origin no autorizado en escritura, 403.
Archivos que exceden 5 MiB reciben 413.

Se valida el contenido real con sharp, sin confiar en extensión ni MIME enviado.
Se admiten JPEG, PNG y WebP estáticos, hasta 16 megapíxeles. Se rechazan SVG,
archivos corruptos y animaciones. Se aplica orientación y se reduce a un máximo
de 1600 × 1600 sin ampliar, se eliminan metadatos y se codifica WebP calidad 80.
La salida se limita a 1 MiB, también mediante una restricción SQL. Una imagen
inválida no reemplaza la anterior. El reemplazo se hace atómicamente dentro de
`catalogWrite` y se conserva al desactivar el producto.

## Cambio de contrato

Las respuestas de productos de gestión y del catálogo público incorporan
`imageUrl: string | null`. Es una ruta relativa al origen de la API: gestión usa
`/api/products/:id/image` y la tienda `/api/shop/products/:id/image`.
La consulta de listados no carga los bytes de las imágenes.

El frontend debe mostrar un marcador cuando el valor sea null y construir la URL
contra el backend o su proxy. Sus pantallas de carga y visualización no se
modificaron en esta tarea.

## Aplicación y pruebas

`npm run build` regenera Prisma. Para aplicar a una instancia local en Docker:
`docker compose up -d --build backend`; el arranque aplica la migración.
La instancia habitual no fue actualizada en esta tarea.

La suite `test/reports-images.e2e-spec.ts` usa PostgreSQL aislado terminado en
`_test`, sesiones reales y HTTP. Verifica roles, Origin, límite de carga,
contenido inválido, conversión WebP, acceso público y eliminación.
