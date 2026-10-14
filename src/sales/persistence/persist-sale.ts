import type { Prisma } from '../../../generated/prisma/client';
import type { PurchaseLine } from '../../products/utils/purchase-lines';
import { saleInclude } from '../presenters/sales-view';

type SaleHeader = Pick<
  Prisma.SaleUncheckedCreateInput,
  | 'customerId'
  | 'customerName'
  | 'customerDocument'
  | 'userId'
  | 'sellerName'
  | 'requestId'
  | 'requestHash'
  | 'total'
>;

// Used by counter sales and confirmed orders inside the same catalogWrite transaction.
export async function persistSale(
  tx: Prisma.TransactionClient,
  header: SaleHeader,
  lines: PurchaseLine[],
) {
  const sale = await tx.sale.create({
    data: {
      ...header,
      items: {
        create: lines.map(
          ({ productId, productName, sku, quantity, unitPrice, subtotal }) => ({
            productId,
            productName,
            sku,
            quantity,
            unitPrice,
            subtotal,
          }),
        ),
      },
    },
    include: saleInclude,
  });
  for (const line of lines) {
    const item = sale.items.find((item) => item.productId === line.productId)!;
    await tx.inventory.update({
      where: { productId: line.productId },
      data: { quantity: { decrement: line.quantity } },
    });
    await tx.stockMovement.create({
      data: {
        productId: line.productId,
        userId: header.userId,
        saleItemId: item.saleItemId,
        type: 'EXIT',
        quantity: -line.quantity,
        previousQuantity: line.previousQuantity,
        resultingQuantity: line.previousQuantity - line.quantity,
        reason: `Venta #${sale.saleId}`,
      },
    });
  }
  return sale;
}
