require('dotenv/config');
const readline = require('node:readline/promises');
const { Writable } = require('node:stream');
const { PrismaClient } = require('../dist/generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { hashPassword } = require('../dist/src/auth/password');
async function main() {
  if (!process.stdin.isTTY) throw new Error('Usa una terminal interactiva para crear el administrador.');
  let muted = false;
  const output = new Writable({ write(chunk, encoding, callback) { if (!muted) process.stdout.write(chunk, encoding); callback(); } });
  const rl = readline.createInterface({ input: process.stdin, output, terminal: true });
  let name, email, password, confirmation;
  try {
    name = (await rl.question('Nombre: ')).trim();
    email = (await rl.question('Email: ')).trim().toLowerCase();
    process.stdout.write('Contraseña (12 a 128 caracteres): '); muted = true;
    password = await rl.question(''); muted = false; process.stdout.write('\n');
    process.stdout.write('Repite la contraseña: '); muted = true;
    confirmation = await rl.question(''); muted = false; process.stdout.write('\n');
  } finally { rl.close(); }
  if (name.length < 2 || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 12 || password.length > 128 || password !== confirmation) throw new Error('Datos inválidos o contraseñas diferentes.');
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const passwordHash = await hashPassword(password);
    await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7140321)`;
      if (await tx.user.count({ where: { role: 'ADMIN' } })) throw new Error('Ya existe un administrador; utiliza la pantalla de usuarios.');
      await tx.user.create({ data: { name, email, passwordHash, role: 'ADMIN' } });
    });
    console.log('Administrador creado. Ya puedes iniciar sesión.');
  } finally { await db.$disconnect(); }
}
main().catch(err => { console.error(err.message); process.exitCode = 1; });
