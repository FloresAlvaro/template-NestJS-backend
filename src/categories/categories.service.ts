import {
  activeStatusWhere,
  type StatusFilter,
} from '../common/utils/status-filter';
import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateCategoryDto) {
    return this.prisma.catalogWrite(async (tx) => {
      const normalizedName = dto.name.toLowerCase();
      if (await tx.category.findUnique({ where: { normalizedName } })) {
        throw new ConflictException(
          `A category with the name '${dto.name}' already exists`,
        );
      }
      return tx.category.create({
        data: { ...dto, normalizedName },
        omit: { normalizedName: true },
      });
    });
  }

  findAll(status: StatusFilter = 'all') {
    return this.prisma.category.findMany({
      where: activeStatusWhere(status),
      orderBy: { categoryId: 'asc' },
      omit: { normalizedName: true },
    });
  }

  async findOne(id: number, db: Prisma.TransactionClient = this.prisma) {
    const category = await db.category.findUnique({
      where: { categoryId: id },
      omit: { normalizedName: true },
    });
    if (!category)
      throw new NotFoundException(`Category with id ${id} not found`);
    return category;
  }

  update(id: number, dto: UpdateCategoryDto) {
    return this.prisma.catalogWrite(async (tx) => {
      await this.findOne(id, tx);
      const normalizedName = dto.name?.toLowerCase();
      if (normalizedName !== undefined) {
        const duplicate = await tx.category.findUnique({
          where: { normalizedName },
        });
        if (duplicate && duplicate.categoryId !== id) {
          throw new ConflictException(
            `A category with the name '${dto.name}' already exists`,
          );
        }
      }
      return tx.category.update({
        where: { categoryId: id },
        data: { ...dto, normalizedName },
        omit: { normalizedName: true },
      });
    });
  }

  remove(id: number) {
    return this.prisma.catalogWrite(async (tx) => {
      const category = await this.findOne(id, tx);
      if (!category.isActive)
        throw new ConflictException(
          `Category with id ${id} is already inactive`,
        );
      if (
        await tx.subCategory.count({
          where: { categoryId: id, isActive: true },
        })
      ) {
        throw new ConflictException(
          `Cannot deactivate category with id ${id}: it still has active subcategories`,
        );
      }
      return tx.category.update({
        where: { categoryId: id },
        data: { isActive: false },
        omit: { normalizedName: true },
      });
    });
  }

  activate(id: number) {
    return this.prisma.catalogWrite(async (tx) => {
      const category = await this.findOne(id, tx);
      if (category.isActive)
        throw new ConflictException(`Category with id ${id} is already active`);
      return tx.category.update({
        where: { categoryId: id },
        data: { isActive: true },
        omit: { normalizedName: true },
      });
    });
  }
}
