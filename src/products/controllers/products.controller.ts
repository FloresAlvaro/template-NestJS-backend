import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  ParseIntPipe,
  Req,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiTags,
  ApiParam,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiCreatedResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import type { AuthRequest } from '../../auth/types/auth.types';
import { Role } from '../../../generated/prisma/client';
import { ProductsService } from '../services/products.service';
import { CreateProductDto } from '../dto/create-product.dto';
import { UpdateProductDto } from '../dto/update-product.dto';
import { ListProductsDto } from '../dto/list-products.dto';
import { PositiveIdPipe } from '../../common/pipes/positive-id.pipe';
import { ProductEntity, ProductPageEntity } from '../entities/product.entity';

@ApiTags('Products')
@ApiBadRequestResponse({ description: 'Invalid input' })
@ApiNotFoundResponse({ description: 'Product or subcategory not found' })
@ApiConflictResponse({
  description: 'Duplicate SKU/barcode or invalid active state',
})
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}
  private visibleProduct<T extends { cost: string }>(
    product: T,
    req: AuthRequest,
  ) {
    if (req.user?.role === Role.ADMIN) return product;
    const result: Partial<T> = { ...product };
    delete result.cost;
    return result;
  }

  @Post()
  @ApiCreatedResponse({ type: ProductEntity })
  @ApiOperation({
    summary: 'Create a product; money values are decimal strings',
  })
  create(@Body() dto: CreateProductDto) {
    return this.products.create(dto);
  }

  @Get()
  @ApiOkResponse({ type: ProductPageEntity })
  @ApiOperation({
    summary: 'List products with pagination and status/subcategory filters',
  })
  async findAll(@Query() query: ListProductsDto, @Req() req: AuthRequest) {
    const result = await this.products.findAll(query);
    return {
      ...result,
      items: result.items.map((item) => this.visibleProduct(item, req)),
    };
  }

  @Get(':id')
  @ApiOkResponse({ type: ProductEntity })
  @ApiParam({ name: 'id', type: Number })
  @ApiOperation({ summary: 'Get a product' })
  async findOne(
    @Param('id', ParseIntPipe, PositiveIdPipe) id: number,
    @Req() req: AuthRequest,
  ) {
    return this.visibleProduct(await this.products.findOne(id), req);
  }

  @Patch(':id')
  @ApiOkResponse({ type: ProductEntity })
  @ApiParam({ name: 'id', type: Number })
  @ApiOperation({
    summary: 'Update product fields; null clears barcode or description',
  })
  update(
    @Param('id', ParseIntPipe, PositiveIdPipe) id: number,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(id, dto);
  }

  @Delete(':id')
  @ApiOkResponse({ type: ProductEntity })
  @ApiParam({ name: 'id', type: Number })
  @ApiOperation({ summary: 'Deactivate a product (soft delete)' })
  remove(@Param('id', ParseIntPipe, PositiveIdPipe) id: number) {
    return this.products.remove(id);
  }

  @Patch(':id/activate')
  @ApiOkResponse({ type: ProductEntity })
  @ApiParam({ name: 'id', type: Number })
  @ApiOperation({ summary: 'Reactivate a product under an active parent' })
  activate(@Param('id', ParseIntPipe, PositiveIdPipe) id: number) {
    return this.products.activate(id);
  }
}
