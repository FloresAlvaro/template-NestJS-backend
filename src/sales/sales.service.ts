import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  preparePurchase,
  sortedPurchaseItems,
} from '../products/purchase-lines';
import { persistSale } from './persist-sale';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateSaleDto, ListSalesDto } from './sales.dto';

import { saleInclude, serializeSale as serialize } from './sales-view';
@Injectable()
export class SalesService {
  constructor(private readonly db: PrismaService) {}
  create(dto: CreateSaleDto, userId: number) {
    const items = sortedPurchaseItems(dto.items);
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ customerId: dto.customerId, items }))
      .digest('hex');
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
      const { lines, total } = await preparePurchase(tx, items);
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
    const search = dto.search?.replace(/[\\%_]/g, '\\$&');
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
