# Límite de autenticación

Aplicar las migraciones antes de arrancar esta versión. `AuthRateLimit` guarda
solo claves SHA-256, contador y vencimiento; no correos, contraseñas ni IP en claro.
Login/registro comparten diez intentos por minuto y dirección. Recuperación usa
otra ventana. El rechazo de Origin ocurre antes de consumir un intento.

El incremento y la renovación son atómicos en PostgreSQL, con reloj de la base.
El límite persiste tras reinicios y es común a todas las instancias. Cada consulta
elimina hasta cien contadores vencidos hace más de cinco minutos. Si falla la base,
no se permite continuar sin límite.

## Nuxt como proxy de confianza

Configurar un secreto aleatorio privado de al menos 32 caracteres en ambos
servidores: `AUTH_PROXY_SECRET` en Nest (también disponible en Compose) y
`NUXT_AUTH_PROXY_SECRET` en Nuxt. Nunca incluirlo en runtimeConfig.public o Git.

Nuxt elimina las cabeceras `x-tienda-client-*` recibidas del navegador y firma con
HMAC-SHA256 la dirección de la conexión entrante y un timestamp. Nest valida IP,
firma y antigüedad máxima de treinta segundos. Ambos servidores requieren relojes
sincronizados y una conexión interna protegida. Una firma inválida devuelve 403.
Sin firma se aplica el límite a la conexión directa; sin secreto nunca se aceptan
las cabeceras de identidad como prueba.

Ni Nest ni Nuxt confían automáticamente en X-Forwarded-For. La configuración cubre
clientes conectados directamente a Nuxt. Si hay un balanceador delante de Nuxt,
debe diseñarse su frontera de confianza antes de usar su IP reenviada; de lo
contrario se comparte el límite por dirección del balanceador. Los usuarios bajo
una misma NAT también comparten IP y límite, como es habitual en límites por IP.

No cambian rutas, DTO, roles ni el formato de respuesta 429.
