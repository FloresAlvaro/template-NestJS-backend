import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { SubCategoriesService } from './sub-categories.service';
import { CreateSubCategoryDto } from './dto/create-sub-category.dto';
import { UpdateSubCategoryDto } from './dto/update-sub-category.dto';
import { SubCategory } from './entities/sub-category.entity';

@ApiTags('Sub Categories')
@Controller('sub-categories')
export class SubCategoriesController {
  constructor(private readonly subCategoriesService: SubCategoriesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new subcategory' })
  @ApiCreatedResponse({
    description: 'Subcategory created successfully',
    type: SubCategory,
  })
  @ApiBadRequestResponse({
    description: 'Validation failed for request body',
  })
  @ApiConflictResponse({
    description:
      'A subcategory with the same name already exists in this category or category is inactive',
  })
  @ApiNotFoundResponse({ description: 'Parent category was not found' })
  create(@Body() createSubCategoryDto: CreateSubCategoryDto) {
    return this.subCategoriesService.create(createSubCategoryDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all subcategories' })
  @ApiQuery({
    name: 'categoryId',
    required: false,
    type: Number,
    description: 'Filter subcategories by parent category ID',
    example: 1,
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['active', 'inactive', 'all'],
    description: 'Filter subcategories by their active status (default: all)',
    example: 'active',
  })
  @ApiOkResponse({
    description: 'Subcategories fetched successfully',
    type: SubCategory,
    isArray: true,
  })
  @ApiBadRequestResponse({
    description:
      'categoryId must be a valid integer when provided, or status must be active, inactive, or all',
  })
  @ApiNotFoundResponse({
    description: 'Parent category not found when categoryId is provided',
  })
  findAll(
    @Query('categoryId', new ParseIntPipe({ optional: true }))
    categoryId?: number,
    @Query('status') status?: string,
  ) {
    const normalizedStatus = (status ?? 'all').toLowerCase();
    const allowedStatuses = ['active', 'inactive', 'all'];

    if (!allowedStatuses.includes(normalizedStatus)) {
      throw new BadRequestException(
        'Invalid status filter. Use active, inactive, or all.',
      );
    }

    return this.subCategoriesService.findAll(
      categoryId,
      normalizedStatus as 'active' | 'inactive' | 'all',
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a subcategory by ID' })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'Subcategory ID',
    example: 1,
  })
  @ApiOkResponse({
    description: 'Subcategory fetched successfully',
    type: SubCategory,
  })
  @ApiBadRequestResponse({ description: 'id must be a valid integer' })
  @ApiNotFoundResponse({ description: 'Subcategory not found' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.subCategoriesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a subcategory by ID' })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'Subcategory ID',
    example: 1,
  })
  @ApiOkResponse({
    description: 'Subcategory updated successfully',
    type: SubCategory,
  })
  @ApiBadRequestResponse({
    description: 'Validation failed for id or request body',
  })
  @ApiNotFoundResponse({ description: 'Subcategory or category not found' })
  @ApiConflictResponse({
    description:
      'A subcategory with the same name already exists in the target category',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateSubCategoryDto: UpdateSubCategoryDto,
  ) {
    return this.subCategoriesService.update(id, updateSubCategoryDto);
  }

  @Patch(':id/activate')
  @ApiOperation({ summary: 'Activate a subcategory' })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'Subcategory ID',
    example: 1,
  })
  @ApiOkResponse({
    description: 'Subcategory activated successfully',
    type: SubCategory,
  })
  @ApiBadRequestResponse({ description: 'id must be a valid integer' })
  @ApiNotFoundResponse({
    description: 'Subcategory or parent category not found',
  })
  @ApiConflictResponse({
    description:
      'Subcategory is already active, or its parent category is inactive',
  })
  activate(@Param('id', ParseIntPipe) id: number) {
    return this.subCategoriesService.activate(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate a subcategory by ID' })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'Subcategory ID',
    example: 1,
  })
  @ApiOkResponse({
    description: 'Subcategory deactivated successfully',
    type: SubCategory,
  })
  @ApiBadRequestResponse({ description: 'id must be a valid integer' })
  @ApiNotFoundResponse({ description: 'Subcategory not found' })
  @ApiConflictResponse({ description: 'Subcategory is already inactive' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.subCategoriesService.remove(id);
  }
}
