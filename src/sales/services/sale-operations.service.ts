import { cashSummary, checkCashBalance } from '../../cash/utils/cash-ledger';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hashRequest } from '../../common/utils/request-hash';
import { Prisma, SaleOperationKind } from '../../../generated/prisma/client';
import { PrismaService } from '../../database/services/prisma.service';
import {
  PaymentMethodDto,
  SaleOperationDto,
  SalePaymentDto,
  SaleReturnDto,
} from '../dto/sales.dto';
import {
  saleBalance,
  saleInclude,
  serializeSale,
} from '../presenters/sales-view';

@Injectable()
export class SaleOperationsService {
  constructor(private readonly db: PrismaService) {}

  execute(
    saleId: number,
    kind: SaleOperationKind,
    dto: SaleOperationDto | SalePaymentDto | SaleReturnDto,
    userId: number,
  ) {
    const lines =
      'items' in dto
        ? [...dto.items].sort((a, b) => a.saleItemId - b.saleItemId)
        : [];
    if (new Set(lines.map((line) => line.saleItemId)).size !== lines.length)
      throw new BadRequestException('No repitas productos en la devolución');
    const requestHash = hashRequest({
      saleId,
      kind,
      reason: dto.reason,
      amount: 'amount' in dto ? dto.amount : null,
      method: 'method' in dto ? dto.method : null,
      lines,
      ...('cashShiftId' in dto && dto.cashShiftId !== undefined
        ? { cashShiftId: dto.cashShiftId }
        : {}),
    });
    return this.db.catalogWrite(async (tx) => {
      const previous = await tx.saleOperation.findUnique({
        where: { requestId: dto.requestId },
      });
      if (
        previous &&
        (previous.userId !== userId || previous.requestHash !== requestHash)
      )
        throw new ConflictException(
          'Identificador utilizado por otra operación',
        );
      const sale = await tx.sale.findUnique({
        where: { saleId },
        include: saleInclude,
      });
      if (!sale) throw new NotFoundException('Venta no encontrada');
      if (previous) return serializeSale(sale);
      const balance = saleBalance(sale);
      let amount = new Prisma.Decimal(0);
      const reversed: {
        saleItemId: number;
        productId: number;
        quantity: number;
        subtotal: Prisma.Decimal;
      }[] = [];
      if (kind === 'PAYMENT' || kind === 'REFUND') {
        if (!('amount' in dto))
          throw new BadRequestException('Falta el importe');
        amount = new Prisma.Decimal(dto.amount);
        if (amount.lte(0))
          throw new BadRequestException('El importe debe ser mayor que cero');
        if (
          kind === 'PAYMENT' &&
          (balance.cancelled || amount.gt(balance.balanceDue))
        )
          throw new ConflictException(
            'El cobro supera el saldo pendiente o la venta está anulada',
          );
        if (kind === 'REFUND' && amount.gt(balance.refundDue))
          throw new ConflictException(
            'El reembolso supera el importe pendiente de devolver',
          );
      } else {
        if (balance.cancelled)
          throw new ConflictException('La venta ya está anulada');
        const remaining = sale.items.map((item) => ({
          ...item,
          remaining:
            item.quantity -
            sale.operations
              .flatMap((op) => op.items)
              .filter((line) => line.saleItemId === item.saleItemId)
              .reduce((sum, line) => sum + line.quantity, 0),
        }));
        const requested =
          kind === 'CANCEL'
            ? remaining
                .filter((item) => item.remaining > 0)
                .map((item) => ({
                  saleItemId: item.saleItemId,
                  quantity: item.remaining,
                }))
            : lines;
        for (const line of requested) {
          const item = remaining.find(
            (item) => item.saleItemId === line.saleItemId,
          );
          if (!item || line.quantity > item.remaining)
            throw new ConflictException(
              'Cantidad devuelta superior a la disponible en esta venta',
            );
          const subtotal = item.unitPrice.mul(line.quantity);
          amount = amount.add(subtotal);
          reversed.push({
            saleItemId: item.saleItemId,
            productId: item.productId,
            quantity: line.quantity,
            subtotal,
          });
        }
      }
      const user = await tx.user.findUniqueOrThrow({ where: { userId } });
      const isSettlement = kind === 'PAYMENT' || kind === 'REFUND';
      const explicitShift = 'cashShiftId' in dto ? dto.cashShiftId : undefined;
      const shift = isSettlement
        ? await tx.cashShift.findFirst({
            where: explicitShift
              ? { shiftId: explicitShift }
              : { userId, closedAt: null },
          })
        : null;
      if (
        explicitShift &&
        (!shift || shift.closedAt || shift.userId !== userId)
      )
        throw new ConflictException(
          'El turno indicado no está abierto a tu nombre',
        );
      if (shift && 'method' in dto && dto.method === PaymentMethodDto.CASH) {
        const summary = await cashSummary(
          tx,
          shift.shiftId,
          shift.openingAmount,
        );
        checkCashBalance(
          new Prisma.Decimal(summary.expectedAmount).add(
            kind === 'PAYMENT' ? amount : amount.negated(),
          ),
        );
      }
      const operation = await tx.saleOperation.create({
        data: {
          saleId,
          userId,
          userName: user.name,
          requestId: dto.requestId,
          requestHash,
          kind,
          amount,
          reason: dto.reason,
          method: 'method' in dto ? dto.method : null,
          items: {
            create: reversed.map((line) => ({
              saleItemId: line.saleItemId,
              quantity: line.quantity,
              subtotal: line.subtotal,
            })),
          },
        },
        include: { items: true },
      });
      if (shift && 'method' in dto && (kind === 'PAYMENT' || kind === 'REFUND'))
        await tx.cashMovement.create({
          data: {
            shiftId: shift.shiftId,
            userId,
            userName: user.name,
            requestId: dto.requestId,
            requestHash,
            kind,
            method: dto.method,
            amount,
            reason: dto.reason,
            saleOperationId: operation.operationId,
          },
        });
      for (const line of reversed) {
        const inventory = await tx.inventory.findUniqueOrThrow({
          where: { productId: line.productId },
        });
        if (inventory.quantity + line.quantity > 2147483647)
          throw new ConflictException(
            'La reposición supera el máximo de stock',
          );
        await tx.inventory.update({
          where: { productId: line.productId },
          data: { quantity: { increment: line.quantity } },
        });
        await tx.stockMovement.create({
          data: {
            productId: line.productId,
            userId,
            operationItemId: operation.items.find(
              (item) => item.saleItemId === line.saleItemId,
            )!.operationItemId,
            type: 'ENTRY',
            quantity: line.quantity,
            previousQuantity: inventory.quantity,
            resultingQuantity: inventory.quantity + line.quantity,
            reason:
              `${kind === 'CANCEL' ? 'Anulación' : 'Devolución'} de venta #${saleId}: ${dto.reason}`.slice(
                0,
                500,
              ),
          },
        });
      }
      if (kind === 'CANCEL') {
        await tx.order.updateMany({
          where: { saleId },
          data: { status: 'CANCELLED', cancelledAt: new Date() },
        });
      }
      return serializeSale(
        await tx.sale.findUniqueOrThrow({
          where: { saleId },
          include: saleInclude,
        }),
      );
    });
  }
}
