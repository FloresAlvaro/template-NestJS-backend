import { escapeSearchText } from '../../common/utils/search-filter';
import {
  availableQuantity,
  reservedQuantities,
} from '../../inventory/utils/reservations';
import { withStock } from '../../inventory/utils/stock-summary';
import { serializePrice } from '../../common/utils/serialize-price';
import { activeStatusWhere } from '../../common/utils/status-filter';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Product } from '../../../generated/prisma/client';
import { PrismaService } from '../../database/services/prisma.service';
import { CreateProductDto } from '../dto/create-product.dto';
import { UpdateProductDto } from '../dto/update-product.dto';
import { ListProductsDto } from '../dto/list-products.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  private serialize(
    product: Product & {
      inventory: { quantity: number; minStock: number } | null;
      image: { productId: number } | null;
    },
    reserved = 0,
  ) {
    const { image, ...fields } = product;
    return {
      ...serializePrice(withStock(fields)),
      reservedQuantity: reserved,
      availableQuantity: availableQuantity(
        product.inventory?.quantity ?? 0,
        reserved,
      ),
      imageUrl: image ? `/api/products/${product.productId}/image` : null,
      cost: product.cost.toFixed(2),
    };
  }

  private async serializeCurrent(
    tx: Prisma.TransactionClient,
    product: Parameters<ProductsService['serialize']>[0],
  ) {
    const reserved =
      (await reservedQuantities(tx, [product.productId])).get(
        product.productId,
      ) ?? 0;
    return this.serialize(product, reserved);
  }

  private async requireParent(tx: Prisma.TransactionClient, id: number) {
    const sub = await tx.subCategory.findUnique({
      where: { subCategoryId: id },
      include: { category: true },
    });
    if (!sub)
      throw new NotFoundException(`Subcategory with id ${id} not found`);
    if (!sub.isActive || !sub.category.isActive)
      throw new ConflictException(
        'Product requires an active subcategory and category',
      );
  }

  private async ensureUnique(
    tx: Prisma.TransactionClient,
    sku?: string,
    barcode?: string | null,
    excludedId?: number,
  ) {
    if (sku !== undefined) {
      const duplicate = await tx.product.findUnique({ where: { sku } });
      if (duplicate && duplicate.productId !== excludedId)
        throw new ConflictException('SKU already exists');
    }
    if (barcode != null) {
      const duplicate = await tx.product.findUnique({ where: { barcode } });
      if (duplicate && duplicate.productId !== excludedId)
        throw new ConflictException('Barcode already exists');
    }
  }

  private async requireProduct(tx: Prisma.TransactionClient, id: number) {
    const product = await tx.product.findUnique({
      where: { productId: id },
      include: { inventory: true, image: { select: { productId: true } } },
    });
    if (!product)
      throw new NotFoundException(`Product with id ${id} not found`);
    return product;
  }

  create(dto: CreateProductDto) {
    return this.prisma.catalogWrite(async (tx) => {
      await this.requireParent(tx, dto.subCategoryId);
      await this.ensureUnique(tx, dto.sku, dto.barcode);
      return this.serializeCurrent(
        tx,
        await tx.product.create({
          data: { ...dto, inventory: { create: {} } },
          include: { inventory: true, image: { select: { productId: true } } },
        }),
      );
    });
  }

  async findAll(query: ListProductsDto) {
    const { status, subCategoryId, page, limit, search, availability } = query;
    if (
      subCategoryId !== undefined &&
      !(await this.prisma.subCategory.findUnique({ where: { subCategoryId } }))
    ) {
      throw new NotFoundException(
        `Subcategory with id ${subCategoryId} not found`,
      );
    }
    const where: Prisma.ProductWhereInput = {
      subCategoryId,
      ...activeStatusWhere(status),
      ...(search
        ? {
            OR: [
              {
                name: {
                  contains: escapeSearchText(search),
                  mode: 'insensitive' as const,
                },
              },
              {
                sku: {
                  contains: escapeSearchText(search),
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };
    if (availability === 'OUT_OF_STOCK') {
      where.AND = [
        {
          OR: [
            { inventory: { is: null } },
            { inventory: { is: { quantity: 0 } } },
          ],
        },
      ];
    } else if (availability === 'LOW_STOCK') {
      where.inventory = {
        is: { quantity: { gt: 0, lte: this.prisma.inventory.fields.minStock } },
      };
    } else if (availability === 'AVAILABLE') {
      where.inventory = {
        is: { quantity: { gt: this.prisma.inventory.fields.minStock } },
      };
    }
    return this.prisma.$transaction(
      async (tx) => {
        const items = await tx.product.findMany({
          include: { inventory: true, image: { select: { productId: true } } },
          where,
          orderBy: { productId: 'asc' },
          skip: (page - 1) * limit,
          take: limit,
        });
        const total = await tx.product.count({ where });
        const reserved = await reservedQuantities(
          tx,
          items.map((item) => item.productId),
        );
        return {
          items: items.map((item) =>
            this.serialize(item, reserved.get(item.productId) ?? 0),
          ),
          total,
          page,
          limit,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async findOne(id: number) {
    return this.prisma.$transaction(
      async (tx) =>
        this.serializeCurrent(tx, await this.requireProduct(tx, id)),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  update(id: number, dto: UpdateProductDto) {
    return this.prisma.catalogWrite(async (tx) => {
      const product = await this.requireProduct(tx, id);
      if (dto.subCategoryId !== undefined || product.isActive)
        await this.requireParent(
          tx,
          dto.subCategoryId ?? product.subCategoryId,
        );
      await this.ensureUnique(tx, dto.sku, dto.barcode, id);
      return this.serializeCurrent(
        tx,
        await tx.product.update({
          where: { productId: id },
          data: dto,
          include: { inventory: true, image: { select: { productId: true } } },
        }),
      );
    });
  }

  remove(id: number) {
    return this.prisma.catalogWrite(async (tx) => {
      const product = await this.requireProduct(tx, id);
      if (!product.isActive)
        throw new ConflictException('Product is already inactive');
      return this.serializeCurrent(
        tx,
        await tx.product.update({
          where: { productId: id },
          include: { inventory: true, image: { select: { productId: true } } },
          data: { isActive: false },
        }),
      );
    });
  }

  activate(id: number) {
    return this.prisma.catalogWrite(async (tx) => {
      const product = await this.requireProduct(tx, id);
      if (product.isActive)
        throw new ConflictException('Product is already active');
      await this.requireParent(tx, product.subCategoryId);
      return this.serializeCurrent(
        tx,
        await tx.product.update({
          where: { productId: id },
          include: { inventory: true, image: { select: { productId: true } } },
          data: { isActive: true },
        }),
      );
    });
  }
}
