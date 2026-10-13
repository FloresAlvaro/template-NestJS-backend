import type { Prisma } from '../../../generated/prisma/client';
export function serializePrice<T extends { salePrice: Prisma.Decimal }>(
  product: T,
) {
  return { ...product, salePrice: product.salePrice.toFixed(2) };
}
