const { createHash } = require('node:crypto');

// Keep the v1 namespace: existing demo operations must retain their identifiers.
function requestId(key) {
  const hex = createHash('sha256')
    .update(`tienda-demo-v1:${key}`)
    .digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
function validate(Dto, input) {
  const { plainToInstance } = require('class-transformer');
  const { validateSync } = require('class-validator');
  const dto = plainToInstance(Dto, input);
  if (validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).length)
    throw new Error(`Datos de demo inválidos para ${Dto.name}.`);
  return dto;
}

// Public fixture credential, deliberately enabled only by the explicit local flag.
const LOCAL_DEMO_PASSWORD = 'TiendaDemo2026!';
function assertLocalDemoTarget(connection, env = process.env) {
  const url = new URL(connection);
  if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return;
  const origins = (env.TRUSTED_ORIGINS || '').split(',').filter(Boolean);
  if (
    url.hostname === 'db' &&
    env.COOKIE_SECURE === 'false' &&
    origins.length &&
    origins.every((origin) => {
      const target = new URL(origin.trim());
      return (
        target.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
      );
    })
  )
    return;
  throw new Error(
    '--local requiere PostgreSQL local o el Compose local con orígenes localhost y COOKIE_SECURE=false.',
  );
}
module.exports = {
  requestId,
  validate,
  LOCAL_DEMO_PASSWORD,
  assertLocalDemoTarget,
};
