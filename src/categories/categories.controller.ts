import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Category } from './entities/category.entity';
import { SubCategoriesService } from 'src/sub-categories/sub-categories.service';

type CategoryStatusFilter = 'active' | 'inactive' | 'all';

@ApiTags('Categories')
@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly categoriesService: CategoriesService,
    private readonly subCategoriesService: SubCategoriesService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new category',
    description:
      'Creates a new category with the provided name and optional description',
  })
  @ApiBody({
    type: CreateCategoryDto,
    description: 'Category data to create',
  })
  @ApiResponse({
    status: 201,
    description: 'Category created successfully',
    type: Category,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data',
  })
  @ApiResponse({
    status: 409,
    description: 'Category with this name already exists',
  })
  create(@Body() createCategoryDto: CreateCategoryDto) {
    return this.categoriesService.create(createCategoryDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all categories',
    description:
      'Retrieves all categories with optional filtering by status (active, inactive, or all)',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['active', 'inactive', 'all'],
    description: 'Filter categories by status',
    example: 'active',
  })
  @ApiResponse({
    status: 200,
    description: 'List of categories retrieved successfully',
    type: [Category],
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid status filter',
  })
  findAll(@Query('status') status?: string) {
    const normalizedStatus = (status ?? 'all').toLowerCase();
    const allowedStatuses: CategoryStatusFilter[] = [
      'active',
      'inactive',
      'all',
    ];

    if (!allowedStatuses.includes(normalizedStatus as CategoryStatusFilter)) {
      throw new BadRequestException(
        'Invalid status filter. Use active, inactive, or all.',
      );
    }

    return this.categoriesService.findAll(
      normalizedStatus as CategoryStatusFilter,
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a category by ID',
    description: 'Retrieves a specific category by its ID',
  })
  @ApiParam({
    name: 'id',
    type: 'number',
    description: 'The unique identifier of the category',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Category retrieved successfully',
    type: Category,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid category ID',
  })
  @ApiResponse({
    status: 404,
    description: 'Category not found',
  })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.findOne(id);
  }

  @Get(':id/sub-categories')
  @ApiOperation({
    summary: 'Get all subcategories of a category',
    description: 'Retrieves a category along with its list of subcategories',
  })
  @ApiParam({
    name: 'id',
    type: 'number',
    description: 'The unique identifier of the parent category',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Category with its subcategories retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Category not found',
  })
  findSubCategories(@Param('id', ParseIntPipe) id: number) {
    const category = this.categoriesService.findOne(id);
    const subCategories = this.subCategoriesService.findAll(id);

    return {
      categoryId: category.categoryId,
      name: category.name,
      subCategories,
    };
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a category',
    description:
      'Updates a specific category with the provided data (name, description, and/or isActive)',
  })
  @ApiParam({
    name: 'id',
    type: 'number',
    description: 'The unique identifier of the category to update',
    example: 1,
  })
  @ApiBody({
    type: UpdateCategoryDto,
    description: 'Category data to update (all fields are optional)',
  })
  @ApiResponse({
    status: 200,
    description: 'Category updated successfully',
    type: Category,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data',
  })
  @ApiResponse({
    status: 404,
    description: 'Category not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Category with this name already exists',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(id, updateCategoryDto);
  }

  @Patch(':id/activate')
  @ApiOperation({
    summary: 'Activate a category',
    description: 'Reactivates a previously deactivated category',
  })
  @ApiParam({
    name: 'id',
    type: 'number',
    description: 'The unique identifier of the category to activate',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Category activated successfully',
    type: Category,
  })
  @ApiResponse({
    status: 404,
    description: 'Category not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Category is already active',
  })
  activate(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.activate(id);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Deactivate a category',
    description: 'Soft-deletes (deactivates) a specific category by its ID',
  })
  @ApiParam({
    name: 'id',
    type: 'number',
    description: 'The unique identifier of the category to delete',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Category deactivated successfully',
    type: Category,
  })
  @ApiResponse({
    status: 404,
    description: 'Category not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Category is already inactive',
  })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.remove(id);
  }
}
