import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiCookieAuth } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/access.decorators';
import type { AuthRequest } from '../../auth/types/auth.types';
import { PositiveIdPipe } from '../../common/pipes/positive-id.pipe';
import { PromotionDto, PromotionListDto } from '../dto/promotions.dto';
import { PromotionsService } from '../services/promotions.service';
@ApiTags('Promotions')
@ApiCookieAuth('tienda_session')
@Roles('ADMIN', 'SELLER')
@Controller('promotions')
export class PromotionsController {
  constructor(private readonly promotions: PromotionsService) {}
  @Get() list(@Query() dto: PromotionListDto, @Req() req: AuthRequest) {
    return this.promotions.list(dto, req.user!);
  }
  @Get(':id') get(
    @Param('id', ParseIntPipe, PositiveIdPipe) id: number,
    @Req() req: AuthRequest,
  ) {
    return this.promotions.get(id, req.user!);
  }
  @Post() @Roles('ADMIN') create(@Body() dto: PromotionDto) {
    return this.promotions.save(dto);
  }
  @Patch(':id') @Roles('ADMIN') update(
    @Param('id', ParseIntPipe, PositiveIdPipe) id: number,
    @Body() dto: PromotionDto,
  ) {
    return this.promotions.save(dto, id);
  }
}
