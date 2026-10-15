import { Prisma } from '../../../generated/prisma/client';
import { unitPromotionDiscount } from './promotion-price';
describe('Historical unit promotion rounding', () => {
  it.each([
    ['0.05', 5000, '0.03'],
    ['9999999999999999.99', 5001, '5000999999999999.99'],
    ['1.00', 10000, '1.00'],
  ])('rounds %s at %s basis points exactly', (price, bps, expected) => {
    expect(
      unitPromotionDiscount(new Prisma.Decimal(price), Number(bps)).toFixed(2),
    ).toBe(expected);
  });
});
