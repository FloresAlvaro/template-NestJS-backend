import { withStock } from '../inventory/stock-summary';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { serializePrice } from '../common/utils/serialize-price';
const select = {
  inventory: { select: { quantity: true, minStock: true } },
  productId: true,
  name: true,
  sku: true,
  description: true,
  salePrice: true,
  subCategoryId: true,
} as const;
const where = {
  isActive: true,
  subCategory: { isActive: true, category: { isActive: true } },
} as const;

@Injectable()
export class ShopService {
  constructor(private readonly db: PrismaService) {}
  async list(dto: PaginationDto) {
    const [items, total] = await this.db.$transaction([
      this.db.product.findMany({
        where,
        select,
        orderBy: { productId: 'asc' },
        take: dto.limit,
        skip: (dto.page - 1) * dto.limit,
      }),
      this.db.product.count({ where }),
    ]);
    return {
      items: items.map((p) => serializePrice(withStock(p))),
      total,
      page: dto.page,
      limit: dto.limit,
    };
  }
  async one(id: number) {
    const product = await this.db.product.findFirst({
      where: { ...where, productId: id },
      select,
    });
    if (!product) throw new NotFoundException('Product not found');
    return serializePrice(withStock(product));
  }
}
