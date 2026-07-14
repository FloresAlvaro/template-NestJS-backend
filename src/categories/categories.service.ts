import {
  Injectable,
  NotFoundException,
  ConflictException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Category } from './entities/category.entity';
import { SubCategoriesService } from 'src/sub-categories/sub-categories.service';

@Injectable()
export class CategoriesService {
  private readonly categories: Category[] = [];
  private nextCategoryId = 1;

  constructor(
    @Inject(forwardRef(() => SubCategoriesService))
    private readonly subCategoriesService: SubCategoriesService,
  ) {}

  create(createCategoryDto: CreateCategoryDto) {
    const existingCategory = this.categories.find(
      (category) =>
        category.name.toLowerCase() === createCategoryDto.name.toLowerCase(),
    );

    if (existingCategory) {
      throw new ConflictException(
        `A category with the name '${createCategoryDto.name}' already exists`,
      );
    }

    const now = new Date();
    const category: Category = {
      categoryId: this.nextCategoryId++,
      name: createCategoryDto.name,
      description: createCategoryDto.description,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    this.categories.push(category);
    return category;
  }

  findAll(status: 'active' | 'inactive' | 'all' = 'all') {
    if (status === 'active') {
      return this.categories.filter((category) => category.isActive);
    }

    if (status === 'inactive') {
      return this.categories.filter((category) => !category.isActive);
    }

    return this.categories;
  }

  findOne(id: number) {
    const category = this.categories.find((item) => item.categoryId === id);

    if (!category) {
      throw new NotFoundException(`Category with id ${id} not found`);
    }

    return category;
  }

  update(id: number, updateCategoryDto: UpdateCategoryDto) {
    const category = this.findOne(id);

    if (updateCategoryDto.name !== undefined) {
      const duplicated = this.categories.find(
        (c) =>
          c.categoryId !== category.categoryId &&
          c.name.toLowerCase() === updateCategoryDto.name!.toLowerCase(),
      );

      if (duplicated) {
        throw new ConflictException(
          `A category with the name '${updateCategoryDto.name}' already exists`,
        );
      }
      category.name = updateCategoryDto.name;
    }

    if (updateCategoryDto.description !== undefined) {
      category.description = updateCategoryDto.description;
    }

    category.updatedAt = new Date();
    return category;
  }

  remove(id: number) {
    const category = this.findOne(id);

    if (!category.isActive) {
      throw new ConflictException(`Category with id ${id} is already inactive`);
    }

    if (this.subCategoriesService.hasActiveSubCategories(id)) {
      throw new ConflictException(
        `Cannot deactivate category with id ${id}: it still has active subcategories`,
      );
    }

    category.isActive = false;
    category.updatedAt = new Date();
    return category;
  }

  activate(id: number) {
    const category = this.findOne(id);
    if (category.isActive) {
      throw new ConflictException(`Category with id ${id} is already active`);
    }
    category.isActive = true;
    category.updatedAt = new Date();
    return category;
  }
}
