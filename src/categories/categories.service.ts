import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Category } from './entities/category.entity';

@Injectable()
export class CategoriesService {
  private readonly categories: Category[] = [];
  private nextCategoryId = 1;

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

  findOne(id: string) {
    const parsedId = Number(id);
    const category = this.categories.find(
      (item) => item.categoryId === parsedId,
    );

    if (!category) {
      throw new NotFoundException(`Category with id ${id} not found`);
    }

    return category;
  }

  update(id: string, updateCategoryDto: UpdateCategoryDto) {
    const category = this.findOne(id);

    if (updateCategoryDto.name !== undefined) {
      category.name = updateCategoryDto.name;
    }

    if (updateCategoryDto.description !== undefined) {
      category.description = updateCategoryDto.description;
    }

    if (updateCategoryDto.isActive !== undefined) {
      category.isActive = updateCategoryDto.isActive;
    }

    category.updatedAt = new Date();
    return category;
  }

  remove(id: string) {
    const category = this.findOne(id);
    category.isActive = false;
    category.updatedAt = new Date();
    return category;
  }
}
