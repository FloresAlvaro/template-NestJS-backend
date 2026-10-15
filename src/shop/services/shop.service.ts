import { withStock } from '../../inventory/utils/stock-summary';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/services/prisma.service';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { serializePrice } from '../../common/utils/serialize-price';
import { Prisma } from '../../../generated/prisma/client';
import {
  availableQuantity,
  reservedQuantities,
} from '../../inventory/utils/reservations';
const select = {
  image: { select: { productId: true } },
  inventory: { select: { quantity: true, minStock: true } },
  productId: true,
  name: true,
  sku: true,
  description: true,
  salePrice: true,
  subCategoryId: true,
} as const;
function serialize(
  product: Prisma.ProductGetPayload<{ select: typeof select }>,
  reserved = 0,
) {
  const { image, ...fields } = product;
  return {
    ...serializePrice(withStock(fields)),
    availableQuantity: availableQuantity(
      product.inventory?.quantity ?? 0,
      reserved,
    ),
    imageUrl: image ? `/api/shop/products/${product.productId}/image` : null,
  };
}
const where = {
  isActive: true,
  subCategory: { isActive: true, category: { isActive: true } },
} as const;

@Injectable()
export class ShopService {
  constructor(private readonly db: PrismaService) {}
  async list(dto: PaginationDto) {
    return this.db.$transaction(
      async (tx) => {
        const items = await tx.product.findMany({
          where,
          select,
          orderBy: { productId: 'asc' },
          take: dto.limit,
          skip: (dto.page - 1) * dto.limit,
        });
        const total = await tx.product.count({ where });
        const reserved = await reservedQuantities(
          tx,
          items.map((p) => p.productId),
        );
        return {
          items: items.map((p) => serialize(p, reserved.get(p.productId))),
          total,
          page: dto.page,
          limit: dto.limit,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  async one(id: number) {
    return this.db.$transaction(
      async (tx) => {
        const product = await tx.product.findFirst({
          where: { ...where, productId: id },
          select,
        });
        if (!product) throw new NotFoundException('Product not found');
        const reserved = (await reservedQuantities(tx, [id])).get(id) ?? 0;
        return serialize(product, reserved);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
