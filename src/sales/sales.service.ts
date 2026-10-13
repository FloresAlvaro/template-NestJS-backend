import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateSaleDto, ListSalesDto } from './sales.dto';

import { saleInclude, serializeSale as serialize } from './sales-view';
@Injectable()
export class SalesService {
  constructor(private readonly db: PrismaService) {}
  create(dto: CreateSaleDto, userId: number) {
    const items = [...dto.items].sort((a, b) => a.productId - b.productId);
    if (new Set(items.map((item) => item.productId)).size !== items.length)
      throw new BadRequestException('No repitas productos en la venta');
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
      const lines: {
        productId: number;
        productName: string;
        sku: string;
        quantity: number;
        unitPrice: Prisma.Decimal;
        subtotal: Prisma.Decimal;
        previousQuantity: number;
      }[] = [];
      let total = new Prisma.Decimal(0);
      const max = new Prisma.Decimal('9999999999999999.99');
      for (const item of items) {
        const product = await tx.product.findUnique({
          where: { productId: item.productId },
          include: {
            inventory: true,
            subCategory: { include: { category: true } },
          },
        });
        if (!product)
          throw new NotFoundException(
            `Producto ${item.productId} no encontrado`,
          );
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
            `El precio de ${product.name} cambió. Actualiza los productos y revisa la venta`,
          );
        const previousQuantity = product.inventory?.quantity ?? 0;
        if (previousQuantity < item.quantity)
          throw new ConflictException(
            `Stock insuficiente de ${product.name}: ${previousQuantity} disponibles`,
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
      const sale = await tx.sale.create({
        data: {
          requestId: dto.requestId,
          requestHash,
          customerId: customer.customerId,
          userId,
          customerName: customer.name,
          customerDocument: customer.document,
          sellerName: seller.name,
          total,
          items: {
            create: lines.map((line) => ({
              productId: line.productId,
              productName: line.productName,
              sku: line.sku,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              subtotal: line.subtotal,
            })),
          },
        },
        include: saleInclude,
      });
      for (const line of lines) {
        const saleItem = sale.items.find(
          (item) => item.productId === line.productId,
        )!;
        await tx.inventory.update({
          where: { productId: line.productId },
          data: { quantity: { decrement: line.quantity } },
        });
        await tx.stockMovement.create({
          data: {
            productId: line.productId,
            userId,
            saleItemId: saleItem.saleItemId,
            type: 'EXIT',
            quantity: -line.quantity,
            previousQuantity: line.previousQuantity,
            resultingQuantity: line.previousQuantity - line.quantity,
            reason: `Venta #${sale.saleId}`,
          },
        });
      }
      return serialize(sale);
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
