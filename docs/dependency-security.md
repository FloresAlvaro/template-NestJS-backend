# Revisión de dependencias — 15 de octubre de 2026

Prisma CLI, cliente y adaptador PostgreSQL se mantienen en 7.10.0. NestJS conserva
la versión mayor 11. La instalación reproducible utiliza npm y package-lock.json;
el lockfile histórico de pnpm del backend no debe usarse para este despliegue.

## Corrección de deepmerge-ts

La cadena prisma → @prisma/config → deepmerge-ts producía tres avisos altos por
un mismo problema de agotamiento de pila con referencias circulares
([GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx)).

Prisma 7.10.0 fija deepmerge-ts 7.1.5. Se aplica un override exclusivo de
@prisma/config@7.10.0 a deepmerge-ts 8.0.2. No se cambia de versión mayor de Prisma
ni se instala una candidata de Prisma 8. La revisión de compatibilidad comprobó
que Prisma usa deepmerge para la carga de configuración de c12. Las diferencias
de la versión 8 incluyen el tratamiento de Maps y referencias circulares; las
pruebas de configuración, CLI, migraciones y aplicación verifican el uso del proyecto.

La regresión scripts/prisma-config.test.cjs resuelve la dependencia desde el
propio @prisma/config y comprueba el caso circular en un proceso con tiempo
limitado, además de cargar la configuración real del repositorio. No basta con
instalar otra copia de deepmerge-ts como dependencia directa.

Cuando se actualice Prisma, revisar su dependencia y retirar el override si ya
no es necesario. Es deliberadamente específico de 7.10.0 para no forzarlo sobre
una versión futura sin validación. Los overrides existentes de Swagger/js-yaml
y Prisma/mysql2 se conservan.

## Auditoría actual

- npm audit --omit=dev: cero vulnerabilidades de producción.
- npm audit completo: veinte avisos moderados de herramientas de desarrollo,
  cero altos y cero críticos. El conteo incluye paquetes padres transitivos.
- Queda el aviso de sprintf-js en la cadena de Jest/argparse/YAML
  ([GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c)).
  No se aplica el retroceso incompatible sugerido por npm audit fix --force.

## Verificación y CI

Backend CI instala con npm ci, bloquea avisos altos/críticos de producción y
comprueba generación/build, ESLint, unitarias, administrador, regresión de
seguridad, preflight, migraciones, API con PostgreSQL/Mailpit, seed aislado e
imagen Docker. Cada base de pruebas termina en _test. El workflow no usa secretos
ni datos de producción y no ejecuta despliegues.
