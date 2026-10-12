import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { CreateSubCategoryDto } from './dto/create-sub-category.dto';
import { UpdateSubCategoryDto } from './dto/update-sub-category.dto';
import { CategoriesService } from '../categories/categories.service';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';

@Injectable()
export class SubCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CategoriesService,
  ) {}

  create(dto: CreateSubCategoryDto) {
    return this.prisma.catalogWrite(async (tx) => {
      const category = await this.categories.findOne(dto.categoryId, tx);
      if (!category.isActive)
        throw new ConflictException(
          'Cannot create a subcategory under an inactive category',
        );
      const normalizedName = dto.name.toLowerCase();
      await this.ensureUnique(tx, dto.categoryId, normalizedName);
      return tx.subCategory.create({
        data: { ...dto, normalizedName },
        omit: { normalizedName: true },
      });
    });
  }

  async findAll(
    categoryId?: number,
    status: 'active' | 'inactive' | 'all' = 'all',
  ) {
    if (categoryId !== undefined) await this.categories.findOne(categoryId);
    return this.prisma.subCategory.findMany({
      where: {
        categoryId,
        ...(status === 'all' ? {} : { isActive: status === 'active' }),
      },
      orderBy: { subCategoryId: 'asc' },
      omit: { normalizedName: true },
    });
  }

  async findOne(id: number, db: Prisma.TransactionClient = this.prisma) {
    const sub = await db.subCategory.findUnique({
      where: { subCategoryId: id },
      omit: { normalizedName: true },
    });
    if (!sub)
      throw new NotFoundException(`Subcategory with id ${id} not found`);
    return sub;
  }

  private async ensureUnique(
    tx: Prisma.TransactionClient,
    categoryId: number,
    normalizedName: string,
    excludedId?: number,
  ) {
    const duplicate = await tx.subCategory.findUnique({
      where: { categoryId_normalizedName: { categoryId, normalizedName } },
    });
    if (duplicate && duplicate.subCategoryId !== excludedId) {
      throw new ConflictException(
        'A subcategory with this name already exists in this category',
      );
    }
  }

  update(id: number, dto: UpdateSubCategoryDto) {
    return this.prisma.catalogWrite(async (tx) => {
      const sub = await this.findOne(id, tx);
      const categoryId = dto.categoryId ?? sub.categoryId;
      const normalizedName = (dto.name ?? sub.name).toLowerCase();
      if (dto.categoryId !== undefined) {
        const category = await this.categories.findOne(categoryId, tx);
        if (!category.isActive)
          throw new ConflictException(
            'Cannot move a subcategory to an inactive category',
          );
      }
      await this.ensureUnique(tx, categoryId, normalizedName, id);
      // Apply all fields together only after every validation has succeeded.
      return tx.subCategory.update({
        where: { subCategoryId: id },
        data: { ...dto, normalizedName },
        omit: { normalizedName: true },
      });
    });
  }

  remove(id: number) {
    return this.prisma.catalogWrite(async (tx) => {
      const sub = await this.findOne(id, tx);
      if (!sub.isActive)
        throw new ConflictException(
          `Subcategory with id ${id} is already inactive`,
        );
      if (
        await tx.product.count({ where: { subCategoryId: id, isActive: true } })
      ) {
        throw new ConflictException(
          'Cannot deactivate a subcategory with active products',
        );
      }
      return tx.subCategory.update({
        where: { subCategoryId: id },
        data: { isActive: false },
        omit: { normalizedName: true },
      });
    });
  }

  activate(id: number) {
    return this.prisma.catalogWrite(async (tx) => {
      const sub = await this.findOne(id, tx);
      if (sub.isActive)
        throw new ConflictException(
          `Subcategory with id ${id} is already active`,
        );
      const category = await this.categories.findOne(sub.categoryId, tx);
      if (!category.isActive)
        throw new ConflictException(
          'Cannot activate a subcategory because its parent category is inactive',
        );
      return tx.subCategory.update({
        where: { subCategoryId: id },
        data: { isActive: true },
        omit: { normalizedName: true },
      });
    });
  }
}
