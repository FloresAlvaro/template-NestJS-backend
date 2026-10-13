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
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthRequest } from '../auth/auth.types';
import { PositiveIdPipe } from '../common/pipes/positive-id.pipe';
import { PaginationDto } from '../common/dto/pagination.dto';
import { InventoryService } from './inventory.service';
import { CreateStockMovementDto, InventorySettingsDto } from './inventory.dto';

@ApiTags('Inventory')
@ApiCookieAuth('tienda_session')
@Controller('products/:id/inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}
  @Get()
  get(@Param('id', ParseIntPipe, PositiveIdPipe) id: number) {
    return this.inventory.get(id);
  }
  @Patch()
  @ApiOperation({ summary: 'Administrator: set minimum stock threshold' })
  settings(
    @Param('id', ParseIntPipe, PositiveIdPipe) id: number,
    @Body() dto: InventorySettingsDto,
  ) {
    return this.inventory.settings(id, dto);
  }
  @Get('movements')
  history(
    @Param('id', ParseIntPipe, PositiveIdPipe) id: number,
    @Query() dto: PaginationDto,
  ) {
    return this.inventory.history(id, dto);
  }
  @Post('movements')
  @ApiOperation({
    summary: 'Administrator: record an entry, exit or counted stock adjustment',
  })
  move(
    @Param('id', ParseIntPipe, PositiveIdPipe) id: number,
    @Body() dto: CreateStockMovementDto,
    @Req() req: AuthRequest,
  ) {
    return this.inventory.move(id, dto, req.user!.userId);
  }
}
