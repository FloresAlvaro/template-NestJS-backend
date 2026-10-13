# Opciones para recuperación de contraseña

Para localhost se implementó SMTP con Nodemailer y Mailpit: ver
[contrato y pasos de prueba](password-recovery-api.md). No requiere dominio ni
entrega correo a Internet. Para publicar queda pendiente elegir proveedor y
configurar remitente. Estas son las alternativas futuras:

| Opción | Uso adecuado | Requisitos |
| --- | --- | --- |
| SMTP mediante Nodemailer | Reutilizar el correo transaccional del hosting o cambiar de proveedor mediante configuración | Servidor SMTP, remitente autorizado y credenciales u OAuth según proveedor |
| Resend por API | Integración directa con Node.js para correo transaccional | API key y dominio propio verificado con acceso a DNS |
| Amazon SES | Infraestructura AWS y necesidades de operación más amplias | Identidad verificada; salir del sandbox para destinatarios no verificados |
| Mailpit | Desarrollo local y pruebas automáticas | Servicio local que captura los mensajes; no entrega correo real a clientes |

Recomendación: Mailpit para pruebas; en producción reutilizar SMTP si ya existe
un proveedor de confianza o elegir Resend si se dispone de dominio propio.
SES es otra opción cuando ya se opera en AWS. No se comparan precios o cuotas:
deben revisarse al contratar según el volumen real.

El backend ya implementa tokens aleatorios guardados como hash, expiración de
15 minutos, uso único atómico, límites y revocación de sesiones al cambiar la
contraseña. Incluye formulario independiente. Integración Nuxt y estrategia de
entrega de producción siguen pendientes. No registrar tokens ni enlaces en logs.

Documentación consultada el 13/10/2026:

- [SMTP en Nodemailer](https://nodemailer.com/smtp)
- [Node.js con Resend](https://resend.com/docs/send-with-nodejs)
- [Verificación de dominio en Resend](https://resend.com/docs/dashboard/domains/introduction)
- [Identidades verificadas de SES](https://docs.aws.amazon.com/ses/latest/dg/verify-addresses-and-domains.html)
- [Acceso a producción de SES](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)
- [Mailpit para pruebas](https://mailpit.axllent.org/docs/usage/)
