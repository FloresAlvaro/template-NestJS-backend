import { applyPromotion } from '../../promotions/utils/apply-promotion';
import {
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hashRequest } from '../../common/utils/request-hash';
import { escapeSearchText } from '../../common/utils/search-filter';
import {
  preparePurchase,
  sortedPurchaseItems,
} from '../../products/utils/purchase-lines';
import { persistSale } from '../persistence/persist-sale';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../database/services/prisma.service';
import { CreateSaleDto, ListSalesDto } from '../dto/sales.dto';

import {
  saleInclude,
  serializeSale as serialize,
} from '../presenters/sales-view';
@Injectable()
export class SalesService {
  constructor(private readonly db: PrismaService) {}
  create(dto: CreateSaleDto, userId: number) {
    if (
      dto.promotionId === undefined &&
      (dto.expectedTotal !== undefined ||
        dto.expectedPromotionVersion !== undefined)
    )
      throw new BadRequestException(
        'Selecciona una promoción para confirmar el descuento',
      );
    const items = sortedPurchaseItems(dto.items);
    const requestHash = hashRequest({
      customerId: dto.customerId,
      items,
      ...(dto.promotionId !== undefined
        ? {
            promotionId: dto.promotionId,
            expectedPromotionVersion: dto.expectedPromotionVersion,
            expectedTotal: dto.expectedTotal,
          }
        : {}),
    });
    return this.db.catalogWrite(async (tx) => {
      const existing = await tx.sale.findUnique({
        where: { requestId: dto.requestId },
        include: saleInclude,
      });
      if (existing) {
        if (existing.userId !== userId || existing.requestHash !== requestHash)
          throw new ConflictException(
            'Identificador de venta utilizado por otra operación',
          );
        return serialize(existing);
      }
      const customer = await tx.customer.findUnique({
        where: { customerId: dto.customerId },
      });
      if (!customer) throw new NotFoundException('Cliente no encontrado');
      if (!customer.isActive)
        throw new ConflictException('El cliente está inactivo');
      const seller = await tx.user.findUniqueOrThrow({ where: { userId } });
      if (!seller.isActive || !['ADMIN', 'SELLER'].includes(seller.role))
        throw new ForbiddenException(
          'El usuario no está habilitado para registrar ventas',
        );
      const prepared = await preparePurchase(tx, items);
      const discounted =
        dto.promotionId !== undefined
          ? await applyPromotion(
              tx,
              prepared.lines,
              prepared.total,
              seller.role,
              dto.promotionId,
              dto.expectedPromotionVersion!,
              dto.expectedTotal!,
            )
          : null;
      const { lines, total } = discounted ?? prepared;
      return serialize(
        await persistSale(
          tx,
          {
            requestId: dto.requestId,
            requestHash,
            customerId: customer.customerId,
            userId,
            customerName: customer.name,
            customerDocument: customer.document,
            sellerName: seller.name,
            total,
            ...(discounted
              ? {
                  grossTotal: discounted.grossTotal,
                  discountTotal: discounted.discountTotal,
                  promotionSnapshot: discounted.promotionSnapshot,
                }
              : {}),
          },
          lines,
        ),
      );
    });
  }
  async get(saleId: number) {
    const sale = await this.db.sale.findUnique({
      where: { saleId },
      include: saleInclude,
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');
    return serialize(sale);
  }
  async list(dto: ListSalesDto) {
    const search = dto.search ? escapeSearchText(dto.search) : undefined;
    const where: Prisma.SaleWhereInput = {
      customerId: dto.customerId,
      ...(search
        ? {
            OR: [
              { customerName: { contains: search, mode: 'insensitive' } },
              { customerDocument: { contains: search, mode: 'insensitive' } },
              {
                items: {
                  some: {
                    OR: [
                      {
                        productName: { contains: search, mode: 'insensitive' },
                      },
                      { sku: { contains: search, mode: 'insensitive' } },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [items, total] = await this.db.$transaction(
      [
        this.db.sale.findMany({
          where,
          include: saleInclude,
          orderBy: { saleId: 'desc' },
          skip: (dto.page - 1) * dto.limit,
          take: dto.limit,
        }),
        this.db.sale.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return {
      items: items.map(serialize),
      total,
      page: dto.page,
      limit: dto.limit,
    };
  }
}
