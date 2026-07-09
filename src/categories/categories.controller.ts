import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

type CategoryStatusFilter = 'active' | 'inactive' | 'all';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  create(@Body() createCategoryDto: CreateCategoryDto) {
    return this.categoriesService.create(createCategoryDto);
  }

  @Get()
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
  findOne(@Param('id') id: string) {
    return this.categoriesService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(id, updateCategoryDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.categoriesService.remove(id);
  }
}
