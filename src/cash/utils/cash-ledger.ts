import { ConflictException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
export async function cashSummary(
  tx: Prisma.TransactionClient,
  shiftId: number,
  openingAmount: Prisma.Decimal,
) {
  const totals = await tx.cashMovement.groupBy({
    by: ['kind', 'method'],
    where: { shiftId },
    _sum: { amount: true },
  });
  let expected = openingAmount;
  const methods = {
    CASH: new Prisma.Decimal(0),
    CARD: new Prisma.Decimal(0),
    TRANSFER: new Prisma.Decimal(0),
  };
  for (const row of totals) {
    const amount = row._sum.amount ?? new Prisma.Decimal(0);
    const signed =
      row.kind === 'REFUND' || row.kind === 'CASH_OUT'
        ? amount.negated()
        : amount;
    if (row.kind === 'PAYMENT' || row.kind === 'REFUND')
      methods[row.method] = methods[row.method].add(signed);
    if (row.method === 'CASH') expected = expected.add(signed);
  }
  const last = await tx.cashMovement.aggregate({
    where: { shiftId },
    _max: { movementId: true },
  });
  return {
    expectedAmount: expected.toFixed(2),
    lastMovementId: last._max.movementId ?? 0,
    netPayments: {
      CASH: methods.CASH.toFixed(2),
      CARD: methods.CARD.toFixed(2),
      TRANSFER: methods.TRANSFER.toFixed(2),
    },
  };
}
export function checkCashBalance(value: Prisma.Decimal) {
  if (value.lt(0) || value.gt('9999999999999999.99'))
    throw new ConflictException(
      'El movimiento deja un saldo de efectivo fuera del rango permitido',
    );
}
