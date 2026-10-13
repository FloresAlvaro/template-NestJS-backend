import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StockMovementType } from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CreateStockMovementDto, InventorySettingsDto } from './inventory.dto';
import { stockSummary } from './stock-summary';
import { availableQuantity, reservedQuantities } from './reservations';

@Injectable()
export class InventoryService {
  constructor(private readonly db: PrismaService) {}

  private async product(tx: Prisma.TransactionClient, productId: number) {
    const product = await tx.product.findUnique({
      where: { productId },
      include: { inventory: true },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');
    return product;
  }

  async get(productId: number) {
    return this.db.$transaction(
      async (tx) => {
        const product = await this.product(tx, productId);
        const reserved =
          (await reservedQuantities(tx, [productId])).get(productId) ?? 0;
        return {
          productId,
          ...stockSummary(product.inventory),
          reservedQuantity: reserved,
          availableQuantity: availableQuantity(
            product.inventory?.quantity ?? 0,
            reserved,
          ),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  settings(productId: number, dto: InventorySettingsDto) {
    return this.db.catalogWrite(async (tx) => {
      await this.product(tx, productId);
      const inventory = await tx.inventory.upsert({
        where: { productId },
        create: { productId, minStock: dto.minStock },
        update: { minStock: dto.minStock },
      });
      return { productId, ...stockSummary(inventory) };
    });
  }

  move(productId: number, dto: CreateStockMovementDto, userId: number) {
    return this.db.catalogWrite(async (tx) => {
      const product = await this.product(tx, productId);
      const previousQuantity = product.inventory?.quantity ?? 0;
      if (
        dto.type === StockMovementType.ADJUSTMENT &&
        dto.expectedQuantity == null
      )
        throw new BadRequestException(
          'El ajuste requiere la cantidad anterior esperada',
        );
      if (
        dto.expectedQuantity != null &&
        dto.expectedQuantity !== previousQuantity
      )
        throw new ConflictException(
          'El stock cambió. Actualiza el inventario y vuelve a intentarlo',
        );
      if (dto.type !== StockMovementType.ADJUSTMENT && dto.quantity === 0)
        throw new BadRequestException(
          'La entrada o salida debe ser mayor que cero',
        );
      const quantity =
        dto.type === StockMovementType.ADJUSTMENT
          ? dto.quantity - previousQuantity
          : dto.type === StockMovementType.EXIT
            ? -dto.quantity
            : dto.quantity;
      const resultingQuantity = previousQuantity + quantity;
      if (resultingQuantity < 0)
        throw new ConflictException('Stock insuficiente');
      if (resultingQuantity > 2147483647)
        throw new BadRequestException('La cantidad excede el máximo permitido');
      if (quantity === 0)
        throw new BadRequestException(
          'El ajuste no cambia la cantidad disponible',
        );
      const reserved =
        (await reservedQuantities(tx, [productId])).get(productId) ?? 0;
      if (resultingQuantity < reserved)
        throw new ConflictException(
          'El stock resultante no puede ser menor que las unidades reservadas por pedidos',
        );
      await tx.inventory.upsert({
        where: { productId },
        create: { productId, quantity: resultingQuantity },
        update: { quantity: resultingQuantity },
      });
      return tx.stockMovement.create({
        data: {
          productId,
          userId,
          type: dto.type,
          quantity,
          previousQuantity,
          resultingQuantity,
          reason: dto.reason,
        },
        include: { user: { select: { userId: true, name: true } } },
      });
    });
  }

  async history(productId: number, dto: PaginationDto) {
    await this.product(this.db, productId);
    const where = { productId };
    const [items, total] = await this.db.$transaction(
      [
        this.db.stockMovement.findMany({
          where,
          orderBy: { stockMovementId: 'desc' },
          take: dto.limit,
          skip: (dto.page - 1) * dto.limit,
          include: {
            user: { select: { userId: true, name: true } },
            saleItem: { select: { saleId: true } },
            operationItem: {
              select: { operation: { select: { saleId: true } } },
            },
          },
        }),
        this.db.stockMovement.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return { items, total, page: dto.page, limit: dto.limit };
  }
}
