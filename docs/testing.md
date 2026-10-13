# Pruebas del backend

Consulta también [el diagrama de ejecución de pruebas](flowcharts.md#8-cómo-funcionan-las-pruebas)
y los flujos de negocio que verifican estas suites.

La ampliación del 13/10/2026 añade 45 casos unitarios y 15 de integración:
el resultado validado es **59 unitarios en 6 suites** y **97 de integración en
8 suites**. Son conteos de casos, no porcentajes de cobertura.

## Pruebas unitarias

```powershell
npm run test:unit
```

No necesitan PostgreSQL ni Mailpit. La configuración Jest de `package.json`
resuelve los imports relativos `.js` del cliente Prisma generado, igual que la
configuración e2e. Generar el cliente previamente con `npm run prisma:generate`
en una instalación nueva.

Las suites nuevas cubren:

- `src/auth/access.guard.spec.ts`: permisos predeterminados, excepciones de
  escritura, prioridad del método sobre el controlador, Origin en rutas públicas,
  sesión ausente/revocada/caducada, usuario inactivo, error de base de datos y
  expiración de la ventana de límites de recuperación.
- `src/auth/recovery-mail.service.spec.ts`: URL y puertos inválidos, credenciales
  incompletas, TLS predeterminado, token en fragmento del enlace configurado,
  errores SMTP sin exponer secretos y cierre del transporte.
- `src/sales/sales-view.spec.ts`: pagos fraccionarios exactos, deuda tras devolución,
  reembolso manual pendiente, estados e historial, importes superiores al entero
  seguro de JavaScript y ausencia de hashes internos en JSON.
- `src/reports/reports.service.spec.ts`: rechazo de períodos inválidos antes de
  consultar la base, límite de 366 días, conversión de zona horaria y propagación
  de errores SQL. Los agregados SQL se prueban en integración, no con mocks.

Las pruebas existentes de DTO y campos PATCH siguen incluidas.

## Integración

Seguir la preparación de PostgreSQL y Mailpit aislados del README y configurar
`TEST_DATABASE_URL` (base terminada en `_test`), `TEST_MAILPIT_URL` y
`TEST_SMTP_PORT`. Usar DATABASE_URL de esa misma base temporal al migrar.

```powershell
npm run db:migrate
npm run test:e2e -- --runInBand
```

`test/report-image-boundaries.e2e-spec.ts` añade 11 casos con HTTP, sesiones reales
y PostgreSQL:

- Período `[from, to)` con desplazamiento horario y fechas imposibles.
- Deuda y saldo a reembolsar de ventas distintas sin compensarlos entre sí;
  operaciones posteriores a la fecha de la venta.
- Ranking con nombres y SKU históricos tras edición y desactivación.
- Paginación estable de alertas, stock cero e inventario ausente.
- Contenido JPEG/PNG/WebP con extensión y MIME engañosos.
- Límite de píxeles decodificados sin reemplazar la imagen anterior.
- Multipart ausente, campos extra, campo incorrecto, duplicados e IDs inválidos.
- Cargas simultáneas: una única imagen válida, sin cambios de precio, stock o
  movimientos; eliminación idempotente.
- Lectura pública restringida por activación de la subcategoría.

`test/password-recovery.e2e-spec.ts` incorpora cuatro casos adicionales:
invalidación del enlace por cambio de rol y por desactivación administrativa;
rollback de contraseña, sesiones y token ante un fallo inyectado dentro de la
transacción; y conservación de contraseña/sesiones al solicitar un enlace.
El rollback usa PostgreSQL real y solo inyecta el fallo del servicio.

Las suites previas de autenticación, inventario, ventas, reportes, imágenes y
SMTP capturado siguen ejecutándose. Los fixtures se crean y limpian en la base
temporal; no usar la base habitual ni el buzón Mailpit local del usuario.

## Otras comprobaciones

```powershell
npm run build
npx eslint "src/**/*.ts" "test/**/*.ts"
```

Esta ampliación no cambia rutas, reglas de negocio, esquema ni dependencias.
No requiere reconstruir la instancia local de Docker.
