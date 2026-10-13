# UML de secuencia de pedidos

[Índice de diagramas](README.md) · [Contrato de pedidos](../orders-api.md)

<a id="crear-pedido"></a>
## Crear un pedido

```mermaid
sequenceDiagram
  actor C as CUSTOMER
  participant G as AccessGuard
  participant H as OrdersController
  participant S as OrdersService
  participant P as PrismaService
  participant DB as PostgreSQL
  C->>G: POST /api/orders + cookie + Origin
  G->>DB: Consultar sesion y usuario activo
  DB-->>G: Sesion y rol
  alt Origin, sesion o rol invalido
    G-->>C: 401 o 403
  else CUSTOMER autorizado
    G->>H: Continuar con validacion global del DTO
    alt DTO invalido
      H-->>C: 400
    else DTO valido
      H->>S: create(dto, userId de sesion)
      S->>P: catalogWrite(callback)
      P->>DB: BEGIN y bloqueo transaccional compartido
      S->>DB: Validar actor, actualizar expiraciones y buscar UUID
      alt UUID existente con mismo usuario y contenido
        DB-->>S: Pedido existente
        P->>DB: COMMIT
        S-->>C: 201 con estado actual, sin nueva reserva
      else UUID usado con otro usuario o contenido
        P->>DB: ROLLBACK
        S-->>C: 409
      else UUID nuevo
        S->>DB: Consultar cliente, productos, precios y reservas vigentes
        alt Cliente, catalogo, precio o stock invalido
          P->>DB: ROLLBACK
          S-->>C: 404 o 409
        else Compra valida
          S->>DB: Crear Order PENDING y OrderItem historicos
          Note over S,DB: Total con Decimal y vencimiento configurable.<br/>No crea Sale ni cambia Inventory.quantity.
          P->>DB: COMMIT
          S-->>C: 201 con pedido propio
        end
      end
    end
  end
```

Se resume la validación de negocio posterior al DTO. También puede devolver 400
si el total excede el máximo permitido. Los errores inesperados revierten la
transacción y no se convierten en respuestas exitosas.

<a id="confirmar-entregar"></a>
## Confirmar, cobrar y entregar

```mermaid
sequenceDiagram
  actor E as ADMIN o SELLER
  participant H as OrdersController
  participant S as OrdersService
  participant P as PrismaService
  participant DB as PostgreSQL
  participant V as API de ventas
  Note over E,H: Cada escritura pasa AccessGuard, Origin y validacion DTO.
  E->>H: POST /api/orders/:id/confirm con UUID y motivo
  H->>S: transition(CONFIRM, actor de sesion)
  S->>P: catalogWrite(callback)
  P->>DB: BEGIN y bloqueo transaccional compartido
  S->>DB: Expirar pendientes y comprobar idempotencia
  alt Reintento identico ya registrado
    P->>DB: COMMIT
    S-->>E: 200 con estado actual, sin duplicar venta
  else Operacion nueva
    S->>DB: Validar PENDING vigente, cliente y catalogo
    S->>DB: Validar stock excluyendo la reserva del propio pedido
    alt Regla invalida o UUID incompatible
      P->>DB: ROLLBACK
      S-->>E: 409
    else Confirmacion valida
      S->>DB: Crear Sale y SaleItem con precios historicos
      S->>DB: Descontar inventario y crear StockMovement
      S->>DB: Vincular Sale, pasar a CONFIRMED y auditar
      Note over P,DB: Un fallo revierte pedido, venta, stock y auditoria.
      P->>DB: COMMIT
      S-->>E: 200 con pedido y resumen de venta
    end
  end
  opt Pedido confirmado correctamente
    E->>H: POST /api/orders/:id/ready con UUID y motivo
    H->>S: transition(READY)
    S->>P: Validar venta vigente y actualizar con catalogWrite
    P->>DB: Transaccion de estado READY y auditoria
    S-->>E: 200 READY
    opt Hay saldo por cobrar
      E->>V: POST /api/sales/:saleId/payments
      V->>P: Validar e ingresar cobro manual con catalogWrite
      P->>DB: Transaccion de cobro idempotente
      V-->>E: Venta con saldos actualizados
    end
    E->>H: POST /api/orders/:id/complete con UUID y motivo
    H->>S: transition(COMPLETE)
    S->>P: Validar y actualizar con catalogWrite
    alt Venta vigente, READY y balanceDue igual a cero
      P->>DB: Transaccion COMPLETED y auditoria
      S-->>E: 200 COMPLETED
    else Estado o saldo impide entrega
      S-->>E: 409 sin cambios
    end
  end
```

Los cobros pueden registrarse después de confirmar, antes o después de preparar.
La secuencia muestra un recorrido posible; no exige cobrar después de READY.
Una venta gratuita no necesita cobro. Ningún paso procesa una transacción bancaria.

La cancelación y el vencimiento se describen en el
[UML de estados](uml-order-states.md#estados-pedido).
