# Índice de diagramas

Los diagramas describen el backend implementado. Se mantienen como bloques
Mermaid dentro de Markdown para versionarlos junto al código y visualizarlos
en GitHub o en un visor compatible con Mermaid. Las rutas y modelos conservan
sus nombres en inglés; las explicaciones están en español.

## UML

| Diagrama | Qué explica |
| --- | --- |
| [Clases: catálogo e inventario](uml-classes.md#catalogo-inventario) | Categorías, productos, existencias y auditoría |
| [Clases: usuarios y sesiones](uml-classes.md#usuarios-sesiones) | Cuenta, cliente, sesión y recuperación |
| [Clases: pedidos y ventas](uml-classes.md#pedidos-ventas) | Reservas, venta vinculada y operaciones históricas |
| [Secuencia: creación de un pedido](uml-sequences.md#crear-pedido) | Permisos, validación, idempotencia y reserva atómica |
| [Secuencia: confirmación y entrega](uml-sequences.md#confirmar-entregar) | Conversión a venta, stock, cobro manual y retiro |
| [Estados del pedido](uml-order-states.md#estados-pedido) | Transiciones permitidas, vencimiento y cancelación |

Las clases representan entidades persistidas, con atributos seleccionados; no
son DTO ni respuestas públicas. Las multiplicidades reflejan el esquema Prisma.
Los diagramas de secuencia resumen la ejecución, sin enumerar cada consulta SQL.

## Diagramas de flujo

| Flujo | Documentación |
| --- | --- |
| Autorización por sesión, rol y Origin | [Permisos](../flowcharts.md#1-permisos-de-una-petición) |
| Venta de mostrador | [Registrar venta](../flowcharts.md#2-registrar-una-venta) |
| Operaciones sobre ventas | [Cobros, devoluciones y reembolsos](../flowcharts.md#3-cobros-devoluciones-y-reembolsos) |
| Solicitud de recuperación | [Recuperar contraseña](../flowcharts.md#4-solicitar-recuperación-de-contraseña) |
| Cambio de contraseña recuperada | [Confirmar contraseña](../flowcharts.md#5-confirmar-una-nueva-contraseña) |
| Fotos de productos | [Imágenes](../flowcharts.md#6-cargar-y-consultar-imágenes) |
| Reportes de gestión | [Reportes](../flowcharts.md#7-consultar-reportes) |
| Ejecución de pruebas | [Pruebas](../flowcharts.md#8-cómo-funcionan-las-pruebas) |
| Pedido, reserva, preparación y retiro | [Pedidos](../orders-api.md#reservas-y-ciclo-de-vida) |

## Referencias

- [Documentación principal](../../README.md).
- [Diseño de base de datos](../database-design.md).
- [Contrato de pedidos](../orders-api.md).
- [Permisos y pendientes](../permissions-and-backlog.md).
