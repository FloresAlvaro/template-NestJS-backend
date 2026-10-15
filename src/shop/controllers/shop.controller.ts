import {
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/access.decorators';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { PositiveIdPipe } from '../../common/pipes/positive-id.pipe';
import { ShopService } from '../services/shop.service';
import { ProductImagesService } from '../../products/services/product-images.service';
@Public()
@ApiTags('Shop')
@Controller('shop/products')
export class ShopController {
  constructor(
    private readonly shop: ShopService,
    private readonly images: ProductImagesService,
  ) {}
  @Get(':id/image')
  @Header('Cache-Control', 'no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  image(@Param('id', ParseIntPipe, PositiveIdPipe) id: number) {
    return this.images.get(id, true);
  }
  @Get()
  list(@Query() dto: PaginationDto) {
    return this.shop.list(dto);
  }
  @Get(':id')
  one(@Param('id', ParseIntPipe, PositiveIdPipe) id: number) {
    return this.shop.one(id);
  }
}
