# UML de clases del dominio

[Índice de diagramas](README.md) · [Diseño de datos](../database-design.md)

Se muestran atributos relevantes y asociaciones del esquema Prisma actual.
`0..1` indica una asociación opcional y `0..*` varios registros posibles.
No se representan las asociaciones como composición UML porque los registros
históricos no se eliminan en cascada junto con su entidad padre.

<a id="catalogo-inventario"></a>
## Catálogo e inventario

```mermaid
classDiagram
  class Category {
    +Int categoryId
    +String name
    +Boolean isActive
  }
  class SubCategory {
    +Int subCategoryId
    +Int categoryId
    +String name
    +Boolean isActive
  }
  class Product {
    +Int productId
    +Int subCategoryId
    +String sku
    +Decimal cost
    +Decimal salePrice
    +Boolean isActive
  }
  class ProductImage {
    +Int productId
    +Bytes content
  }
  class Inventory {
    +Int productId
    +Int quantity
    +Int minStock
  }
  class StockMovement {
    +Int stockMovementId
    +StockMovementType type
    +Int quantity
    +Int previousQuantity
    +Int resultingQuantity
    +String reason
  }
  class User {
    +Int userId
  }
  Category "1" -- "0..*" SubCategory : contiene
  SubCategory "1" -- "0..*" Product : clasifica
  Product "1" -- "0..1" Inventory : existencias
  Product "1" -- "0..1" ProductImage : imagen
  Product "1" -- "0..*" StockMovement : historial
  User "1" -- "0..*" StockMovement : registra
```

Cada producto pertenece a una sola subcategoría y cada subcategoría a una
categoría. `quantity` es stock físico. La disponibilidad se calcula restando
las reservas de pedidos PENDING no vencidos; no existe un contador persistido de
reservas en Inventory. Los movimientos físicos conservan actor y cantidades.

<a id="usuarios-sesiones"></a>
## Usuarios y sesiones

```mermaid
classDiagram
  class User {
    +Int userId
    +String email
    +String passwordHash
    +Role role
    +Boolean isActive
  }
  class Role {
    <<enumeration>>
    ADMIN
    SELLER
    CUSTOMER
  }
  class Customer {
    +Int customerId
    +Int userId
    +String name
    +String document
    +Boolean isActive
  }
  class Session {
    +String tokenHash
    +DateTime expiresAt
  }
  class PasswordReset {
    +String tokenHash
    +DateTime expiresAt
  }
  User --> Role : tiene
  User "0..1" -- "0..1" Customer : perfil comercial
  User "1" -- "0..*" Session : sesiones
  User "1" -- "0..1" PasswordReset : recuperacion vigente
```

Customer puede existir sin User. User puede no tener perfil comercial; la
compra online exige CUSTOMER con perfil activo vinculado. Session y PasswordReset
guardan hashes, no el token original. Estos atributos internos nunca forman
parte de una respuesta pública.

<a id="pedidos-ventas"></a>
## Pedidos y ventas

```mermaid
classDiagram
  class User {
    +Int userId
  }
  class Customer {
    +Int customerId
  }
  class Product {
    +Int productId
  }
  class Order {
    +Int orderId
    +UUID requestId
    +String requestHash
    +OrderStatus status
    +Decimal total
    +DateTime expiresAt
    +String customerName
  }
  class OrderItem {
    +Int orderItemId
    +Int quantity
    +String productName
    +String sku
    +Decimal unitPrice
    +Decimal subtotal
  }
  class OrderOperation {
    +Int operationId
    +UUID requestId
    +String requestHash
    +OrderOperationKind kind
    +String userName
    +String reason
  }
  class Sale {
    +Int saleId
    +UUID requestId
    +String requestHash
    +String customerName
    +String sellerName
    +Decimal total
  }
  class SaleItem {
    +Int saleItemId
    +Int quantity
    +String productName
    +String sku
    +Decimal unitPrice
    +Decimal subtotal
  }
  class SaleOperation {
    +Int operationId
    +UUID requestId
    +String requestHash
    +SaleOperationKind kind
    +Decimal amount
    +PaymentMethod method
    +String reason
  }
  class SaleOperationItem {
    +Int operationItemId
    +Int quantity
    +Decimal subtotal
  }
  class StockMovement {
    +Int stockMovementId
    +Int quantity
  }
  User "1" -- "0..*" Order : propietario
  Customer "1" -- "0..*" Order : comprador
  Order "1" -- "0..*" OrderItem : detalle
  Product "1" -- "0..*" OrderItem : producto
  Order "1" -- "0..*" OrderOperation : auditoria
  User "1" -- "0..*" OrderOperation : actor
  Order "0..1" -- "0..1" Sale : venta vinculada
  Customer "1" -- "0..*" Sale : comprador
  User "1" -- "0..*" Sale : vendedor
  Sale "1" -- "0..*" SaleItem : detalle
  Product "1" -- "0..*" SaleItem : producto
  Sale "1" -- "0..*" SaleOperation : operaciones
  User "1" -- "0..*" SaleOperation : actor
  SaleOperation "1" -- "0..*" SaleOperationItem : unidades afectadas
  SaleItem "1" -- "0..*" SaleOperationItem : detalle original
  SaleItem "0..1" -- "0..1" StockMovement : salida original
  SaleOperationItem "0..1" -- "0..1" StockMovement : reposicion
```

La API exige al menos una línea para pedidos y ventas, aunque las claves
foráneas permiten cero hijos y por eso las asociaciones muestran `0..*`.
Una venta de mostrador no necesita Order. Un pedido pendiente no tiene Sale;
la confirmación los vincula uno a uno y conserva precios históricos.

OrderOperationKind contiene CONFIRM, READY, COMPLETE y CANCEL.
SaleOperationKind contiene PAYMENT, REFUND, RETURN y CANCEL. Los cobros y
reembolsos registran dinero manualmente; no llaman a una pasarela.
El estado y los saldos de Sale se calculan desde sus operaciones; no hay una
columna `Sale.status`. Ver [estados UML de Order](uml-order-states.md).
