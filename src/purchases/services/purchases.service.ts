import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  PurchaseOperationKind,
  Role,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../database/services/prisma.service';
import { hashRequest } from '../../common/utils/request-hash';
import { escapeSearchText } from '../../common/utils/search-filter';
import {
  CreatePurchaseDto,
  ListPurchasesDto,
  PurchaseOperationDto,
  ReceivePurchaseDto,
} from '../dto/purchases.dto';
import {
  purchaseInclude,
  serializePurchase,
} from '../presenters/purchases-view';

@Injectable()
export class PurchasesService {
  constructor(private readonly db: PrismaService) {}
  private async actor(tx: Prisma.TransactionClient, userId: number) {
    const user = await tx.user.findUnique({ where: { userId } });
    if (!user?.isActive || user.role !== Role.ADMIN)
      throw new ForbiddenException(
        'Solo un administrador activo puede gestionar compras',
      );
    return user;
  }
  private async require(tx: Prisma.TransactionClient, purchaseId: number) {
    const purchase = await tx.purchase.findUnique({
      where: { purchaseId },
      include: purchaseInclude,
    });
    if (!purchase) throw new NotFoundException('Compra no encontrada');
    return purchase;
  }
  create(dto: CreatePurchaseDto, userId: number) {
    if (
      new Set(dto.items.map((item) => item.productId)).size !== dto.items.length
    )
      throw new BadRequestException('No repitas productos en la compra');
    const items = [...dto.items].sort((a, b) => a.productId - b.productId);
    const requestHash = hashRequest({
      supplierId: dto.supplierId,
      reference: dto.reference ?? null,
      notes: dto.notes ?? null,
      items,
    });
    return this.db.catalogWrite(async (tx) => {
      const user = await this.actor(tx, userId);
      const previous = await tx.purchase.findUnique({
        where: { requestId: dto.requestId },
        include: purchaseInclude,
      });
      if (previous) {
        if (previous.userId !== userId || previous.requestHash !== requestHash)
          throw new ConflictException(
            'Identificador de compra utilizado por otra operación',
          );
        return serializePurchase(previous);
      }
      const supplier = await tx.supplier.findUnique({
        where: { supplierId: dto.supplierId },
      });
      if (!supplier) throw new NotFoundException('Proveedor no encontrado');
      if (!supplier.isActive)
        throw new ConflictException('El proveedor está inactivo');
      const products = await tx.product.findMany({
        where: { productId: { in: items.map((item) => item.productId) } },
        include: { subCategory: { include: { category: true } } },
      });
      let total = new Prisma.Decimal(0);
      const max = new Prisma.Decimal('9999999999999999.99');
      const lines = items.map((item) => {
        const product = products.find(
          (product) => product.productId === item.productId,
        );
        if (!product)
          throw new NotFoundException(
            `Producto ${item.productId} no encontrado`,
          );
        if (
          !product.isActive ||
          !product.subCategory.isActive ||
          !product.subCategory.category.isActive
        )
          throw new ConflictException(`${product.name} no está habilitado`);
        const unitCost = new Prisma.Decimal(item.unitCost),
          subtotal = unitCost.mul(item.quantity);
        total = total.add(subtotal);
        if (subtotal.gt(max) || total.gt(max))
          throw new BadRequestException('El total supera el máximo permitido');
        return {
          productId: product.productId,
          productName: product.name,
          sku: product.sku,
          quantity: item.quantity,
          unitCost,
          subtotal,
        };
      });
      return serializePurchase(
        await tx.purchase.create({
          data: {
            requestId: dto.requestId,
            requestHash,
            supplierId: supplier.supplierId,
            supplierName: supplier.name,
            supplierDocument: supplier.document,
            userId,
            userName: user.name,
            reference: dto.reference,
            notes: dto.notes,
            total,
            items: { create: lines },
          },
          include: purchaseInclude,
        }),
      );
    });
  }
  async get(id: number) {
    return serializePurchase(await this.require(this.db, id));
  }
  async list(dto: ListPurchasesDto) {
    const search = dto.search ? escapeSearchText(dto.search) : undefined;
    const where: Prisma.PurchaseWhereInput = {
      supplierId: dto.supplierId,
      status: dto.status,
      ...(search
        ? {
            OR: [
              { supplierName: { contains: search, mode: 'insensitive' } },
              { reference: { contains: search, mode: 'insensitive' } },
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
        this.db.purchase.findMany({
          where,
          include: purchaseInclude,
          orderBy: { purchaseId: 'desc' },
          skip: (dto.page - 1) * dto.limit,
          take: dto.limit,
        }),
        this.db.purchase.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return {
      items: items.map(serializePurchase),
      total,
      page: dto.page,
      limit: dto.limit,
    };
  }
  transition(
    purchaseId: number,
    kind: PurchaseOperationKind,
    dto: PurchaseOperationDto | ReceivePurchaseDto,
    userId: number,
  ) {
    const updateCost =
      kind === 'RECEIVE' && 'updateCost' in dto ? dto.updateCost : false;
    const requestHash = hashRequest({
      purchaseId,
      kind,
      reason: dto.reason,
      updateCost,
    });
    return this.db.catalogWrite(async (tx) => {
      const user = await this.actor(tx, userId);
      const purchase = await this.require(tx, purchaseId);
      const previous = await tx.purchaseOperation.findUnique({
        where: { requestId: dto.requestId },
      });
      if (previous) {
        if (previous.userId !== userId || previous.requestHash !== requestHash)
          throw new ConflictException(
            'Identificador utilizado por otra operación',
          );
        return serializePurchase(purchase);
      }
      if (purchase.status !== 'PENDING')
        throw new ConflictException(
          'Solo se puede recibir o cancelar una compra pendiente',
        );
      if (kind === 'RECEIVE') {
        const supplier = await tx.supplier.findUniqueOrThrow({
          where: { supplierId: purchase.supplierId },
        });
        if (!supplier.isActive)
          throw new ConflictException('El proveedor está inactivo');
        for (const item of purchase.items) {
          const product = await tx.product.findUniqueOrThrow({
            where: { productId: item.productId },
            include: {
              inventory: true,
              subCategory: { include: { category: true } },
            },
          });
          if (
            !product.isActive ||
            !product.subCategory.isActive ||
            !product.subCategory.category.isActive
          )
            throw new ConflictException(`${product.name} no está habilitado`);
          const previousQuantity = product.inventory?.quantity ?? 0;
          const resultingQuantity = previousQuantity + item.quantity;
          if (resultingQuantity > 2147483647)
            throw new ConflictException(
              'La recepción supera el máximo de stock',
            );
          await tx.inventory.upsert({
            where: { productId: item.productId },
            create: { productId: item.productId, quantity: resultingQuantity },
            update: { quantity: resultingQuantity },
          });
          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              userId,
              purchaseItemId: item.purchaseItemId,
              type: 'ENTRY',
              quantity: item.quantity,
              previousQuantity,
              resultingQuantity,
              reason: `Recepción de compra #${purchaseId}: ${dto.reason}`.slice(
                0,
                500,
              ),
            },
          });
          if (updateCost)
            await tx.product.update({
              where: { productId: item.productId },
              data: { cost: item.unitCost },
            });
        }
      }
      const at = new Date();
      await tx.purchase.update({
        where: { purchaseId },
        data:
          kind === 'RECEIVE'
            ? { status: 'RECEIVED', receivedAt: at }
            : { status: 'CANCELLED', cancelledAt: at },
      });
      await tx.purchaseOperation.create({
        data: {
          purchaseId,
          requestId: dto.requestId,
          requestHash,
          kind,
          reason: dto.reason,
          updateCost,
          userId,
          userName: user.name,
        },
      });
      return serializePurchase(await this.require(tx, purchaseId));
    });
  }
}
