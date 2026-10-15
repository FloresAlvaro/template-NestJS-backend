import { unitPromotionDiscount } from './promotion-price';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import type { PurchaseLine } from '../../products/utils/purchase-lines';
export async function applyPromotion(
  tx: Prisma.TransactionClient,
  lines: PurchaseLine[],
  gross: Prisma.Decimal,
  role: string,
  promotionId: number,
  expectedVersion: number,
  expectedTotal: string,
) {
  const p = await tx.promotion.findUnique({ where: { promotionId } });
  const at = new Date();
  if (
    !p ||
    !p.isActive ||
    p.startsAt > at ||
    p.endsAt <= at ||
    p.version !== expectedVersion
  )
    throw new ConflictException(
      'La promoción cambió, está inactiva o fuera de vigencia. Actualiza y revisa el total',
    );
  if (role !== 'ADMIN' && !p.allowSeller)
    throw new ForbiddenException('Esta promoción requiere un administrador');
  if (gross.lt(p.minSubtotal))
    throw new ConflictException(
      'La venta no alcanza el mínimo de la promoción',
    );
  let total = new Prisma.Decimal(0);
  const discounted = lines.map((line) => {
    const discount = unitPromotionDiscount(line.unitPrice, p.percentBps);
    const unitPrice = line.unitPrice.sub(discount);
    const subtotal = unitPrice.mul(line.quantity);
    total = total.add(subtotal);
    return {
      ...line,
      listUnitPrice: line.unitPrice,
      unitDiscount: discount,
      unitPrice,
      subtotal,
    };
  });
  if (total.toFixed(2) !== expectedTotal)
    throw new ConflictException(
      'El total con descuento cambió. Revisa la venta',
    );
  return {
    lines: discounted,
    total,
    grossTotal: gross,
    discountTotal: gross.sub(total),
    promotionSnapshot: {
      promotionId: p.promotionId,
      code: p.code,
      name: p.name,
      percentBps: p.percentBps,
      version: p.version,
      startsAt: p.startsAt.toISOString(),
      endsAt: p.endsAt.toISOString(),
      minSubtotal: p.minSubtotal.toFixed(2),
      allowSeller: p.allowSeller,
    },
  };
}
