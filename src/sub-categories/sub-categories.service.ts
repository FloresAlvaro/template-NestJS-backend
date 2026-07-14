import {
  Injectable,
  NotFoundException,
  ConflictException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { CreateSubCategoryDto } from './dto/create-sub-category.dto';
import { UpdateSubCategoryDto } from './dto/update-sub-category.dto';
import { CategoriesService } from '../categories/categories.service';
import { SubCategory } from './entities/sub-category.entity';

@Injectable()
export class SubCategoriesService {
  private readonly subCategories: SubCategory[] = [];
  private nextSubCategoryId = 1;
  constructor(
    @Inject(forwardRef(() => CategoriesService))
    private readonly categoriesService: CategoriesService,
  ) {}

  create(createSubCategoryDto: CreateSubCategoryDto) {
    const parentCategory = this.categoriesService.findOne(
      createSubCategoryDto.categoryId,
    );

    if (!parentCategory.isActive) {
      throw new ConflictException(
        `Cannot create a subcategory under category ${createSubCategoryDto.categoryId} because it is inactive`,
      );
    }

    const duplicateSubCategory = this.subCategories.find(
      (sub) =>
        sub.categoryId === createSubCategoryDto.categoryId &&
        sub.name.toLowerCase() === createSubCategoryDto.name.toLowerCase(),
    );

    if (duplicateSubCategory) {
      throw new ConflictException(
        `A subcategory with the name '${createSubCategoryDto.name}' already exists in this category`,
      );
    }

    const now = new Date();
    const subCategory: SubCategory = {
      subCategoryId: this.nextSubCategoryId++,
      categoryId: createSubCategoryDto.categoryId,
      name: createSubCategoryDto.name,
      description: createSubCategoryDto.description,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    this.subCategories.push(subCategory);
    return subCategory;
  }

  findAll(categoryId?: number, status: 'active' | 'inactive' | 'all' = 'all') {
    if (categoryId !== undefined) {
      this.categoriesService.findOne(categoryId);
    }

    return this.subCategories.filter((sub) => {
      const matchesCategory =
        categoryId !== undefined ? sub.categoryId === categoryId : true;

      let matchesStatus = true;
      if (status === 'active') {
        matchesStatus = sub.isActive === true;
      } else if (status === 'inactive') {
        matchesStatus = sub.isActive === false;
      }
      return matchesCategory && matchesStatus;
    });
  }

  findOne(id: number) {
    const subCategory = this.subCategories.find(
      (sub) => sub.subCategoryId === id,
    );

    if (!subCategory) {
      throw new NotFoundException(`Subcategory with id ${id} not found`);
    }

    return subCategory;
  }

  update(id: number, updateSubCategoryDto: UpdateSubCategoryDto) {
    const subCategory = this.findOne(id);

    if (updateSubCategoryDto.name !== undefined) {
      const targetCategoryId =
        updateSubCategoryDto.categoryId ?? subCategory.categoryId;

      const duplicateSubCategory = this.subCategories.find(
        (sub) =>
          sub.subCategoryId !== subCategory.subCategoryId &&
          sub.categoryId === targetCategoryId &&
          sub.name.toLowerCase() === updateSubCategoryDto.name!.toLowerCase(),
      );

      if (duplicateSubCategory) {
        throw new ConflictException(
          `A subcategory with the name '${updateSubCategoryDto.name}' already exists in this category`,
        );
      }

      subCategory.name = updateSubCategoryDto.name;
    }

    if (updateSubCategoryDto.categoryId !== undefined) {
      // Si permitís mover de padre, hay que validar que el nuevo padre exista
      this.categoriesService.findOne(updateSubCategoryDto.categoryId);

      const duplicateSubCategory = this.subCategories.find(
        (sub) =>
          sub.subCategoryId !== subCategory.subCategoryId &&
          sub.categoryId === updateSubCategoryDto.categoryId &&
          sub.name.toLowerCase() === subCategory.name.toLowerCase(),
      );

      if (duplicateSubCategory) {
        throw new ConflictException(
          `A subcategory with the name '${subCategory.name}' already exists in this category`,
        );
      }

      subCategory.categoryId = updateSubCategoryDto.categoryId;
    }

    if (updateSubCategoryDto.description !== undefined) {
      subCategory.description = updateSubCategoryDto.description;
    }

    subCategory.updatedAt = new Date();
    return subCategory;
  }

  remove(id: number) {
    const subCategory = this.findOne(id);

    if (!subCategory.isActive) {
      throw new ConflictException(
        `Subcategory with id ${id} is already inactive`,
      );
    }

    subCategory.isActive = false;
    subCategory.updatedAt = new Date();
    return subCategory;
  }

  // Método auxiliar para que CategoriesService pueda chequear la regla
  // "no desactivar categoría padre si tiene subcategorías activas"
  hasActiveSubCategories(categoryId: number): boolean {
    return this.subCategories.some(
      (sub) => sub.categoryId === categoryId && sub.isActive,
    );
  }

  activate(id: number) {
    const subCategory = this.findOne(id);
    if (subCategory.isActive) {
      throw new ConflictException(
        `Subcategory with id ${id} is already active`,
      );
    }
    // acá va la validación pendiente: que la categoría padre esté activa
    const parentCategory = this.categoriesService.findOne(
      subCategory.categoryId,
    );
    if (!parentCategory.isActive) {
      throw new ConflictException(
        `Cannot activate subcategory ${id} because its parent category is inactive`,
      );
    }
    subCategory.isActive = true;
    subCategory.updatedAt = new Date();
    return subCategory;
  }
}
