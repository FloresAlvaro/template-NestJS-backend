import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Product } from '../../generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ListProductsDto } from './dto/list-products.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  private serialize(product: Product) {
    return {
      ...product,
      cost: product.cost.toFixed(2),
      salePrice: product.salePrice.toFixed(2),
    };
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
    const product = await tx.product.findUnique({ where: { productId: id } });
    if (!product)
      throw new NotFoundException(`Product with id ${id} not found`);
    return product;
  }

  create(dto: CreateProductDto) {
    return this.prisma.catalogWrite(async (tx) => {
      await this.requireParent(tx, dto.subCategoryId);
      await this.ensureUnique(tx, dto.sku, dto.barcode);
      return this.serialize(await tx.product.create({ data: dto }));
    });
  }

  async findAll(query: ListProductsDto) {
    const { status, subCategoryId, page, limit } = query;
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
      ...(status === 'all' ? {} : { isActive: status === 'active' }),
    };
    const [items, total] = await this.prisma.$transaction(
      [
        this.prisma.product.findMany({
          where,
          orderBy: { productId: 'asc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        this.prisma.product.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return {
      items: items.map((item) => this.serialize(item)),
      total,
      page,
      limit,
    };
  }

  async findOne(id: number) {
    return this.serialize(await this.requireProduct(this.prisma, id));
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
      return this.serialize(
        await tx.product.update({ where: { productId: id }, data: dto }),
      );
    });
  }

  remove(id: number) {
    return this.prisma.catalogWrite(async (tx) => {
      const product = await this.requireProduct(tx, id);
      if (!product.isActive)
        throw new ConflictException('Product is already inactive');
      return this.serialize(
        await tx.product.update({
          where: { productId: id },
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
      return this.serialize(
        await tx.product.update({
          where: { productId: id },
          data: { isActive: true },
        }),
      );
    });
  }
}
