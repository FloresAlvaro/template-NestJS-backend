# Diagramas de flujo del backend

Estos diagramas describen la implementación actual. Los rectángulos son acciones,
los rombos son decisiones y las flechas indican el siguiente paso. Un rollback
deshace todos los cambios de la transacción; no revierte operaciones anteriores
ya confirmadas. Son vistas resumidas, no sustituyen los contratos de cada API.

El flujo de pedidos, reservas, preparación, cobro y retiro está en
[pedidos de autoservicio](orders-api.md#reservas-y-ciclo-de-vida).

## 1. Permisos de una petición

El guard se ejecuta antes de los DTO y del controlador. Una ruta pública de
escritura sigue necesitando un Origin autorizado.

```mermaid
flowchart TD
    A[Petición a la API] --> B{¿Es una escritura?}
    B -->|Sí| C{¿Origin autorizado?}
    C -->|No| X[403: acceso rechazado]
    C -->|Sí| D[Aplicar límite si es login, registro o recuperación]
    B -->|No| D
    D --> E{¿Supera el límite?}
    E -->|Sí| Y[429: demasiados intentos]
    E -->|No o no aplica| F{¿Ruta pública?}
    F -->|Sí| V[Validar los datos de entrada]
    F -->|No| G{¿Sesión vigente y usuario activo?}
    G -->|No| Z[401: iniciar sesión]
    G -->|Sí| H{¿Rol permitido?}
    H -->|No| X
    H -->|Sí| V
    V --> I{¿Datos válidos?}
    I -->|No| J[400: corregir datos]
    I -->|Sí| K[Ejecutar controlador y servicio]
```

Si no existe una regla explícita de rol, las lecturas de gestión permiten
ADMIN/SELLER y las escrituras ADMIN. La regla del método prevalece sobre la del
controlador. Ver [matriz de permisos](permissions-and-backlog.md).

## 2. Registrar una venta

ADMIN y SELLER pueden registrar ventas. El servidor obtiene al vendedor de su
sesión, calcula los importes y compara el precio esperado que envió el cliente.

```mermaid
flowchart TD
    A[Solicitud con cliente, artículos y UUID] --> B[Comprobar permisos y validar DTO]
    B --> C{¿Hay productos repetidos?}
    C -->|Sí| E[Rechazar solicitud]
    C -->|No| T[Iniciar transacción con bloqueo compartido]
    T --> D{¿UUID ya utilizado?}
    D -->|Sí| F{¿Mismo usuario y contenido?}
    F -->|Sí| G[Devolver venta existente sin duplicar efectos]
    F -->|No| H[409: conflicto de idempotencia]
    D -->|No| I[Validar cliente y vendedor activos]
    I --> J[Validar productos, padres, precios y stock]
    J --> K{¿Se cumplen todas las reglas?}
    K -->|No| R[Rollback y respuesta de error]
    K -->|Sí| L[Calcular total con aritmética decimal]
    L --> M[Guardar venta y artículos históricos]
    M --> N[Descontar stock y registrar movimientos]
    N --> O{¿Finaliza sin errores?}
    O -->|No| R
    O -->|Sí| P[Confirmar transacción y devolver venta]
```

Crear una venta no registra un cobro. Si falla una escritura, no debe quedar
una venta parcial ni un descuento de inventario sin su movimiento. Ver
[clientes y ventas](customers-sales-api.md).

## 3. Cobros, devoluciones y reembolsos

Después de comprobar permisos, DTO e idempotencia, el servicio consulta los
saldos actuales dentro del mismo bloqueo transaccional.

```mermaid
flowchart TD
    A[Operación solicitada sobre una venta] --> B[Permisos, validación e idempotencia]
    B --> C{¿Es un reintento idéntico?}
    C -->|Sí| D[Devolver estado actual sin repetir efectos]
    C -->|No| E[Calcular deuda y saldo a reembolsar]
    E --> F{¿Tipo de operación?}
    F -->|Cobro: ADMIN o SELLER| G[Validar importe positivo y deuda suficiente]
    F -->|Reembolso: ADMIN| H[Validar importe positivo y saldo a devolver]
    F -->|Devolución: ADMIN| I[Validar artículos y unidades aún no devueltas]
    F -->|Anulación: ADMIN| J[Seleccionar unidades restantes]
    G --> K[Guardar operación monetaria manual]
    H --> K
    I --> L[Usar precios originales, reponer stock y auditar]
    J --> L
    K --> M[Confirmar transacción y devolver nuevos saldos]
    L --> M
    G -.->|Error| R[Rechazar y revertir la transacción]
    H -.->|Error| R
    I -.->|Error| R
    J -.->|Error| R
    K -.->|Error de persistencia| R
    L -.->|Error de persistencia| R
```

Una devolución o anulación puede generar saldo a devolver, pero no reembolsa
dinero automáticamente. El reembolso se registra por separado. Estos cobros y
reembolsos no ejecutan transacciones bancarias. Ver [operaciones de venta](sale-operations-api.md).

## 4. Solicitar recuperación de contraseña

El límite y Origin se verifican antes de ejecutar el servicio. Mailpit captura
los mensajes localmente; no los entrega a Internet.

```mermaid
flowchart TD
    A[Introducir correo en el formulario] --> B[Validar Origin, límite y correo]
    B --> C{¿SMTP está configurado y accesible?}
    C -->|No| X[503: correo temporalmente no disponible]
    C -->|Sí| D[Buscar cuenta y limpiar tokens caducados]
    D --> E{¿Cuenta existente y activa?}
    E -->|No| Z[200: respuesta genérica]
    E -->|Sí| F[Crear token aleatorio válido por 15 minutos]
    F --> G[Guardar solo su hash y sustituir el token anterior]
    G --> H[Enviar enlace a Mailpit]
    H --> I{¿Envío aceptado?}
    I -->|Sí| Z
    I -->|No| J[Eliminar únicamente el token recién creado]
    J --> X
```

La respuesta normal no revela si la cuenta existe. Pedir el enlace no cambia
la contraseña ni revoca sesiones. Si falla la base de datos, el error se propaga;
el diagrama muestra por separado los fallos de SMTP.

## 5. Confirmar una nueva contraseña

El enlace contiene el token en un fragmento. El formulario lo envía por POST,
junto con la nueva contraseña, y lo retira de la barra del navegador.

```mermaid
flowchart TD
    A[Abrir enlace recibido en Mailpit] --> B[Introducir nueva contraseña]
    B --> C[Validar Origin, límite, token y longitud]
    C --> D[Calcular hash de la nueva contraseña]
    D --> E[Iniciar transacción con bloqueo compartido]
    E --> F{¿Token válido, vigente y usuario activo?}
    F -->|No| X[400: enlace inválido o caducado]
    F -->|Sí| G[Actualizar contraseña]
    G --> H[Eliminar sesiones y tokens del usuario]
    H --> I{¿Finaliza sin errores?}
    I -->|No| R[Rollback: conservar contraseña, sesiones y token anteriores]
    I -->|Sí| J[Confirmar transacción y limpiar cookie]
    J --> K[Iniciar sesión con la nueva contraseña]
```

El mismo enlace no puede consumirse dos veces, ni siquiera con solicitudes
simultáneas. Ver [recuperación local](password-recovery-api.md).

## 6. Cargar y consultar imágenes

```mermaid
flowchart TD
    A[ADMIN carga una imagen] --> B[Verificar sesión, Origin y límite de 5 MiB]
    B --> C{¿JPEG, PNG o WebP estático válido y hasta 16 megapíxeles?}
    C -->|No| X[Rechazar sin reemplazar la imagen anterior]
    C -->|Sí| D[Orientar, reducir y convertir a WebP]
    D --> E{¿Salida de hasta 1 MiB?}
    E -->|No| X
    E -->|Sí| F[En transacción, comprobar producto y guardar una única imagen]
    F --> G[Devolver imageUrl]
    G --> H{¿Quién consulta la imagen?}
    H -->|ADMIN o SELLER por ruta de gestión| I[Buscar imagen almacenada]
    H -->|Público por ruta de tienda| J{¿Producto y sus padres están activos?}
    J -->|Sí| I
    J -->|No| Z[404: imagen no disponible]
    I --> K{¿Existe imagen?}
    K -->|Sí| L[Responder bytes WebP]
    K -->|No| Z
```

Las consultas pueden hacerse después, independientemente de la carga. Guardar
una imagen no cambia stock ni precios. Ver [contrato de imágenes](product-images-api.md).

## 7. Consultar reportes

```mermaid
flowchart TD
    A[ADMIN solicita un reporte] --> B[Validar sesión, rol y parámetros]
    B --> C{¿Reporte solicitado?}
    C -->|Ventas o ranking| D[Validar período con zona horaria, hasta 366 días]
    D --> E[Seleccionar ventas desde from incluido hasta to excluido]
    E --> F[Consultar todas sus operaciones registradas hasta ahora]
    F --> G[Calcular saldos o unidades netas sin compensar deudas entre ventas]
    C -->|Inventario o alertas| H[Consultar productos activos con padres activos]
    H --> I[Clasificar existencias o paginar productos bajo el mínimo]
    G --> J[Devolver reporte con importes decimales como texto]
    I --> J
```

El reporte de ventas refleja el estado actual de las ventas creadas en el
período. No reconstruye el saldo histórico al cierre ni mide los movimientos de
caja ocurridos exclusivamente durante ese período. Ver [reportes](reports-api.md).

## 8. Cómo funcionan las pruebas

Una prueba unitaria aísla una regla o componente. Una prueba de integración
conecta componentes reales y comprueba sus efectos persistidos.

```mermaid
flowchart TD
    A[Caso de prueba] --> B{¿Qué se quiere comprobar?}
    B -->|Una regla aislada| U[Preparar entradas y dependencias simuladas si hacen falta]
    U --> V[Ejecutar función o componente real]
    V --> W[Comparar resultado o error con lo esperado]
    B -->|Flujo integrado| C[Preparar PostgreSQL y Mailpit temporales]
    C --> D{¿Base identificada con sufijo _test?}
    D -->|No| E[Detener pruebas]
    D -->|Sí| F[Aplicar migraciones y configurar NestJS]
    F --> G[Crear usuarios, sesiones y datos de prueba]
    G --> H[Enviar solicitudes HTTP o ejecutar un servicio transaccional]
    H --> I[Comprobar respuesta, registros, stock y correos según el caso]
    I --> J[Limpiar registros de prueba y cerrar la aplicación]
    J --> W
    W --> K{¿Coincide con lo esperado?}
    K -->|Sí| L[Prueba aprobada]
    K -->|No| M[Prueba fallida: investigar la diferencia]
```

Un rechazo esperado también puede aprobar una prueba. Por ejemplo, si SELLER
intenta subir una imagen y recibe 403, la protección funciona correctamente.
Los contenedores temporales se detienen y eliminan al terminar la ejecución
validada; nunca se usa la base habitual como sustituto. Ver [guía de pruebas](testing.md).
