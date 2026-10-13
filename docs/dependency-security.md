# Revisión de dependencias — 13 de octubre de 2026

Se actualizaron las resoluciones compatibles de `package-lock.json` con npm,
sin `--force`. Prisma CLI, cliente y adaptador PostgreSQL quedan alineados en
7.10.0. NestJS conserva la versión mayor 11.

Los `overrides` de `package.json` sustituyen dependencias fijadas por sus padres:

- Swagger: `js-yaml` 5.4.3 o posterior dentro de la versión mayor 5.
- Prisma: `mysql2` 3.24.6 o posterior dentro de la versión mayor 3.

Revisar si estas excepciones siguen siendo necesarias al actualizar sus padres.
Las correcciones se reproducen con `npm ci`; el lockfile histórico de pnpm no
se actualizó porque esta instalación y Docker usan npm.

## Hallazgos pendientes

La auditoría final reporta 0 críticos, 3 altos y 20 moderados. El conteo incluye
paquetes padres afectados por dependencias transitivas: no son 23 fallos distintos.
Los avisos raíz restantes son:

- `deepmerge-ts` 7.1.5, fijado por `@prisma/config`: agotamiento de pila con
  objetos cíclicos. La corrección está en la versión mayor 8; no se fuerza esa
  sustitución dentro de Prisma. [Aviso](https://github.com/advisories/GHSA-ggr8-5vv4-36mx).
- `sprintf-js`, usado por `argparse` y el YAML 3 de la cadena de cobertura de
  Jest: denegación de servicio por precisión sin límite. npm no ofrece una
  corrección compatible de esta cadena y propone retroceder ts-jest a 27.
  [Aviso](https://github.com/advisories/GHSA-hp3w-g68c-fv3c).

No se aplicaron los retrocesos de Prisma a 6 ni de ts-jest a 27 propuestos por
`npm audit fix --force`. El backend usa PostgreSQL; MySQL2 pertenece a las
herramientas de Prisma, pero también se corrigió.

## Validación

- `npm run build`: correcto, con generación del cliente Prisma 7.10.0.
- `npm run test:unit`: 2 suites y 14 pruebas correctas.
- ESLint sobre `src/**/*.ts` y `test/**/*.ts`: correcto.
- No se ejecutaron pruebas e2e con PostgreSQL ni se actualizó la instancia Docker.
  No se modificaron el esquema, las migraciones ni los contratos HTTP.
