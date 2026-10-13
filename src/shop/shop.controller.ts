import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/access.decorators';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PositiveIdPipe } from '../common/pipes/positive-id.pipe';
import { ShopService } from './shop.service';
@Public()
@ApiTags('Shop')
@Controller('shop/products')
export class ShopController {
  constructor(private readonly shop: ShopService) {}
  @Get()
  list(@Query() dto: PaginationDto) {
    return this.shop.list(dto);
  }
  @Get(':id')
  one(@Param('id', ParseIntPipe, PositiveIdPipe) id: number) {
    return this.shop.one(id);
  }
}
