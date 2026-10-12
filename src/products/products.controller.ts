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
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ListProductsDto } from './dto/list-products.dto';
import { ProductIdPipe } from './products-id.pipe';
import { ProductEntity, ProductPageEntity } from './entities/product.entity';

@ApiTags('Products')
@ApiBadRequestResponse({ description: 'Invalid input' })
@ApiNotFoundResponse({ description: 'Product or subcategory not found' })
@ApiConflictResponse({
  description: 'Duplicate SKU/barcode or invalid active state',
})
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

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
  findAll(@Query() query: ListProductsDto) {
    return this.products.findAll(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: ProductEntity })
  @ApiParam({ name: 'id', type: Number })
  @ApiOperation({ summary: 'Get a product' })
  findOne(@Param('id', ParseIntPipe, ProductIdPipe) id: number) {
    return this.products.findOne(id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: ProductEntity })
  @ApiParam({ name: 'id', type: Number })
  @ApiOperation({
    summary: 'Update product fields; null clears barcode or description',
  })
  update(
    @Param('id', ParseIntPipe, ProductIdPipe) id: number,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(id, dto);
  }

  @Delete(':id')
  @ApiOkResponse({ type: ProductEntity })
  @ApiParam({ name: 'id', type: Number })
  @ApiOperation({ summary: 'Deactivate a product (soft delete)' })
  remove(@Param('id', ParseIntPipe, ProductIdPipe) id: number) {
    return this.products.remove(id);
  }

  @Patch(':id/activate')
  @ApiOkResponse({ type: ProductEntity })
  @ApiParam({ name: 'id', type: Number })
  @ApiOperation({ summary: 'Reactivate a product under an active parent' })
  activate(@Param('id', ParseIntPipe, ProductIdPipe) id: number) {
    return this.products.activate(id);
  }
}
