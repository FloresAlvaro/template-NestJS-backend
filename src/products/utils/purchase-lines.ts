import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import {
  availableQuantity,
  reservedQuantities,
} from '../../inventory/utils/reservations';
import type { SaleLineDto } from '../../sales/dto/sales.dto';

export type PurchaseLine = {
  productId: number;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  previousQuantity: number;
};

export function sortedPurchaseItems(items: SaleLineDto[]): SaleLineDto[] {
  if (new Set(items.map((item) => item.productId)).size !== items.length)
    throw new BadRequestException('No repitas productos en la operación');
  return [...items].sort((a, b) => a.productId - b.productId);
}

export async function preparePurchase(
  tx: Prisma.TransactionClient,
  items: SaleLineDto[],
  at = new Date(),
) {
  const sorted = sortedPurchaseItems(items);
  const products = await tx.product.findMany({
    where: { productId: { in: sorted.map((item) => item.productId) } },
    include: { inventory: true, subCategory: { include: { category: true } } },
  });
  const reserved = await reservedQuantities(
    tx,
    sorted.map((item) => item.productId),
    at,
  );
  const lines: PurchaseLine[] = [];
  let total = new Prisma.Decimal(0);
  const max = new Prisma.Decimal('9999999999999999.99');
  for (const item of sorted) {
    const product = products.find(
      (product) => product.productId === item.productId,
    );
    if (!product)
      throw new NotFoundException(`Producto ${item.productId} no encontrado`);
    if (
      !product.isActive ||
      !product.subCategory.isActive ||
      !product.subCategory.category.isActive
    )
      throw new ConflictException(
        `${product.name} no está habilitado para venta`,
      );
    if (product.salePrice.toFixed(2) !== item.expectedUnitPrice)
      throw new ConflictException(
        `El precio de ${product.name} cambió. Actualiza los productos y revisa la operación`,
      );
    const previousQuantity = product.inventory?.quantity ?? 0;
    const available = availableQuantity(
      previousQuantity,
      reserved.get(product.productId) ?? 0,
    );
    if (available < item.quantity)
      throw new ConflictException(
        `Stock insuficiente de ${product.name}: ${available} disponibles`,
      );
    const subtotal = product.salePrice.mul(item.quantity);
    total = total.add(subtotal);
    if (subtotal.gt(max) || total.gt(max))
      throw new BadRequestException('El total supera el máximo permitido');
    lines.push({
      productId: product.productId,
      productName: product.name,
      sku: product.sku,
      quantity: item.quantity,
      unitPrice: product.salePrice,
      subtotal,
      previousQuantity,
    });
  }
  return { lines, total };
}
