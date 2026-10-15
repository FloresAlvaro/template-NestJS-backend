import { Prisma } from '../../../generated/prisma/client';
// Intermediate basis-point multiplication needs more precision than a stored amount.
const ExactDecimal = Prisma.Decimal.clone({ precision: 40 });
export function unitPromotionDiscount(
  price: Prisma.Decimal,
  percentBps: number,
): Prisma.Decimal {
  return new Prisma.Decimal(
    new ExactDecimal(price.toFixed(2))
      .mul(percentBps)
      .div(10000)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
      .toFixed(2),
  );
}
