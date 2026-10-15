const fixtures = require('./seed-cash-data.cjs');
const { requestId, validate } = require('./seed-demo-utils.cjs');
const cashMarkerId = requestId(fixtures.shifts.at(-1).key);
const closeReason = 'Demo de caja: arqueo ficticio de cierre';

// Runs inside the complete demo transaction, after its advisory lock.
async function seedCashDemo(tx, cash) {
  const marker = await tx.cashShift.findUnique({
    where: { requestId: cashMarkerId },
  });
  if (marker) {
    const fixture = fixtures.shifts.at(-1);
    if (
      !marker.closedAt ||
      marker.closeRequestId !== requestId(fixture.key + '-close') ||
      marker.closeReason !== closeReason ||
      marker.openingAmount.toFixed(2) !== fixture.opening ||
      marker.countedAmount?.toFixed(2) !== fixture.counted
    )
      throw new Error(
        'El identificador reservado de caja demo pertenece a otro turno.',
      );
    return {
      alreadyLoaded: true,
      registersCreated: 0,
      shiftsCreated: 0,
      movementsCreated: 0,
      closuresCreated: 0,
    };
  }
  const shiftIds = fixtures.shifts.map((s) => requestId(s.key));
  const closeIds = fixtures.shifts
    .filter((s) => s.counted)
    .map((s) => requestId(s.key + '-close'));
  const movementIds = fixtures.shifts.flatMap((s) => [
    requestId(s.key + '-income'),
    requestId(s.key + '-withdrawal'),
  ]);
  const collisions = [
    await tx.cashRegister.count({
      where: {
        OR: fixtures.registers.map((name) => ({
          name: { equals: name, mode: 'insensitive' },
        })),
      },
    }),
    await tx.cashShift.count({
      where: {
        OR: [
          { requestId: { in: shiftIds } },
          { closeRequestId: { in: closeIds } },
        ],
      },
    }),
    await tx.cashMovement.count({ where: { requestId: { in: movementIds } } }),
  ];
  if (collisions.some(Boolean))
    throw new Error(
      'Existen identidades reservadas de caja demo sin una carga completa. No se reemplazaron registros.',
    );
  const users = await tx.user.findMany({
    where: { email: { in: [...new Set(fixtures.shifts.map((s) => s.email))] } },
  });
  for (const fixture of fixtures.shifts) {
    const actor = users.find((u) => u.email === fixture.email);
    if (!actor?.isActive || !['ADMIN', 'SELLER'].includes(actor.role))
      throw new Error(
        'Caja demo requiere las cuentas activas de administrador, vendedor y Laura; no se modificaron sus roles ni estados.',
      );
    if (
      await tx.cashShift.findFirst({
        where: { userId: actor.userId, closedAt: null },
      })
    )
      throw new Error(
        'Una cuenta demo ya tiene un turno abierto ajeno a esta carga. Ciérralo antes de ampliar la demo de caja.',
      );
  }
  const {
    RegisterDto,
    OpenShiftDto,
    ManualCashDto,
    CloseShiftDto,
  } = require('../dist/src/cash/dto/cash.dto');
  const { cashSummary } = require('../dist/src/cash/utils/cash-ledger');
  const { Prisma } = require('../dist/generated/prisma/client');
  const registers = [];
  for (const name of fixtures.registers)
    registers.push(await cash.register(validate(RegisterDto, { name })));
  const at = Date.now();
  const scenarios = [];
  for (const fixture of fixtures.shifts) {
    const actor = users.find((u) => u.email === fixture.email);
    const shift = await cash.open(
      validate(OpenShiftDto, {
        requestId: requestId(fixture.key),
        registerId: registers[fixture.register].registerId,
        openingAmount: fixture.opening,
      }),
      actor,
    );
    const base = new Date(
      at - fixture.daysAgo * 86400000 - (fixture.counted ? 10 : 2) * 3600000,
    );
    await tx.cashShift.update({
      where: { shiftId: shift.shiftId },
      data: { openedAt: base },
    });
    for (const [index, kind, amount, suffix] of [
      [1, 'CASH_IN', fixture.income, 'income'],
      [2, 'CASH_OUT', fixture.withdrawal, 'withdrawal'],
    ]) {
      const movement = await cash.move(
        shift.shiftId,
        validate(ManualCashDto, {
          requestId: requestId(fixture.key + '-' + suffix),
          kind,
          amount,
          reason:
            kind === 'CASH_IN'
              ? 'Demo de caja: ingreso ficticio de efectivo'
              : 'Demo de caja: retiro ficticio para gastos menores',
        }),
        actor,
      );
      await tx.cashMovement.update({
        where: { movementId: movement.movementId },
        data: { createdAt: new Date(base.getTime() + index * 1800000) },
      });
    }
    const summary = await cashSummary(
      tx,
      shift.shiftId,
      new Prisma.Decimal(fixture.opening),
    );
    if (fixture.counted) {
      await cash.close(
        shift.shiftId,
        validate(CloseShiftDto, {
          requestId: requestId(fixture.key + '-close'),
          countedAmount: fixture.counted,
          expectedLastMovementId: summary.lastMovementId,
          reason: closeReason,
        }),
        actor,
      );
      await tx.cashShift.update({
        where: { shiftId: shift.shiftId },
        data: { closedAt: new Date(base.getTime() + 8 * 3600000) },
      });
    }
    scenarios.push({
      scenario: fixture.key,
      shiftId: shift.shiftId,
      expectedAmount: summary.expectedAmount,
    });
  }
  return {
    alreadyLoaded: false,
    registersCreated: registers.length,
    shiftsCreated: scenarios.length,
    movementsCreated: scenarios.length * 2,
    closuresCreated: fixtures.shifts.filter((s) => s.counted).length,
    scenarios,
  };
}
module.exports = { seedCashDemo, cashMarkerId };
