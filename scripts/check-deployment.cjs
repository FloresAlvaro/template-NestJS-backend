const fs = require('node:fs');
const dotenv = require('dotenv');
const { spawnSync } = require('node:child_process');

// Read-only preflight. Never print configuration values or alter files/data.
function checkDeployment(backend, frontend, { production = false } = {}) {
  const errors = [];
  const secret = backend.AUTH_PROXY_SECRET;
  if (!secret || secret.length < 32 || !secret.trim())
    errors.push('AUTH_PROXY_SECRET debe contener al menos 32 caracteres aleatorios.');
  if (!frontend.NUXT_AUTH_PROXY_SECRET || frontend.NUXT_AUTH_PROXY_SECRET !== secret)
    errors.push('NUXT_AUTH_PROXY_SECRET debe coincidir con AUTH_PROXY_SECRET.');
  try {
    const db = new URL(backend.DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(db.protocol) || db.pathname.length < 2) throw Error();
  } catch {
    errors.push('DATABASE_URL debe identificar una base PostgreSQL válida.');
  }
  const origins = (backend.TRUSTED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  if (!origins.length) errors.push('Configura TRUSTED_ORIGINS con los orígenes del frontend.');
  for (const value of origins) {
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol) || url.origin !== value || (production && url.protocol !== 'https:')) throw Error();
    } catch {
      errors.push('TRUSTED_ORIGINS contiene un origen inválido o sin HTTPS para producción.');
      break;
    }
  }
  try {
    const api = new URL(frontend.NUXT_BACKEND_API_BASE || 'http://localhost:3001/api');
    if (!['http:', 'https:'].includes(api.protocol) || api.username || api.password || api.search || api.hash || api.pathname.replace(/\/$/, '') !== '/api') throw Error();
  } catch {
    errors.push('NUXT_BACKEND_API_BASE debe ser una URL privada HTTP(S) con ruta /api, sin credenciales.');
  }
  if (production && backend.COOKIE_SECURE !== 'true')
    errors.push('COOKIE_SECURE debe ser true para producción HTTPS.');
  return errors;
}

if (require.main === module) {
  try {
    dotenv.config({ quiet: true });
    const args = process.argv.slice(2);
    let backend = process.env;
    if (args.includes('--compose')) {
      const config = spawnSync('docker', ['compose', 'config', '--format', 'json'], { encoding: 'utf8' });
      if (config.status !== 0) throw Error();
      backend = JSON.parse(config.stdout).services.backend.environment;
    }
    const index = args.indexOf('--frontend-env');
    let frontend = process.env;
    if (index !== -1) {
      if (!args[index + 1]) throw Error();
      frontend = { ...dotenv.parse(fs.readFileSync(args[index + 1])), ...Object.fromEntries(
        Object.entries(process.env).filter(([key]) => key.startsWith('NUXT_')),
      ) };
    }
    const errors = checkDeployment(backend, frontend, { production: args.includes('--production') });
    if (errors.length) {
      for (const error of errors) console.error(error);
      process.exitCode = 1;
    } else {
      console.log('Configuración válida. Falta comprobar backup, migraciones y servicios según docs/deployment.md.');
    }
  } catch {
    console.error('No se pudo leer la configuración. Usa --frontend-env RUTA o las variables NUXT_* del entorno.');
    process.exitCode = 1;
  }
}
module.exports = { checkDeployment };
