require('dotenv/config');
require('reflect-metadata');
const readline = require('node:readline/promises');
const { Writable } = require('node:stream');
const { PrismaClient } = require('../dist/generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { hashPassword } = require('../dist/src/auth/security/password');
const { plainToInstance } = require('class-transformer');
const { validateSync } = require('class-validator');
const { RegisterDto } = require('../dist/src/auth/dto/auth.dto');

function validateAdminInput(input, confirmation) {
  const dto = plainToInstance(RegisterDto, input);
  if (
    validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).length ||
    dto.password !== confirmation
  )
    throw new Error('Datos inválidos o contraseñas diferentes.');
  return dto;
}

async function createAdmin(db, input, confirmation) {
  const { name, email, password } = validateAdminInput(input, confirmation);
  const passwordHash = await hashPassword(password);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(7140321)`;
    if (await tx.user.count({ where: { role: 'ADMIN' } }))
      throw new Error(
        'Ya existe un administrador; utiliza la pantalla de usuarios.',
      );
    return tx.user.create({
      data: { name, email, passwordHash, role: 'ADMIN' },
    });
  });
}

async function main() {
  if (!process.stdin.isTTY)
    throw new Error(
      'Usa una terminal interactiva para crear el administrador.',
    );
  let muted = false;
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) process.stdout.write(chunk, encoding);
      callback();
    },
  });
  const rl = readline.createInterface({
    input: process.stdin,
    output,
    terminal: true,
  });
  let name, email, password, confirmation;
  try {
    name = (await rl.question('Nombre: ')).trim();
    email = (await rl.question('Email: ')).trim().toLowerCase();
    process.stdout.write('Contraseña (12 a 128 caracteres): ');
    muted = true;
    password = await rl.question('');
    muted = false;
    process.stdout.write('\n');
    process.stdout.write('Repite la contraseña: ');
    muted = true;
    confirmation = await rl.question('');
    muted = false;
    process.stdout.write('\n');
  } finally {
    rl.close();
  }
  const input = validateAdminInput({ name, email, password }, confirmation);
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    await createAdmin(db, input, confirmation);
    console.log('Administrador creado. Ya puedes iniciar sesión.');
  } finally {
    await db.$disconnect();
  }
}
if (require.main === module)
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
module.exports = { createAdmin, validateAdminInput };
