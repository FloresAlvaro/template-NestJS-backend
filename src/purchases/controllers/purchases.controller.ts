import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../../generated/prisma/client';
import { Roles } from '../../auth/decorators/access.decorators';
import type { AuthRequest } from '../../auth/types/auth.types';
import { PositiveIdPipe } from '../../common/pipes/positive-id.pipe';
import {
  CreatePurchaseDto,
  ListPurchasesDto,
  PurchaseOperationDto,
  ReceivePurchaseDto,
} from '../dto/purchases.dto';
import { PurchasesService } from '../services/purchases.service';

@ApiTags('Purchases')
@ApiCookieAuth('tienda_session')
@Roles(Role.ADMIN)
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}
  @Get() list(@Query() dto: ListPurchasesDto) {
    return this.purchases.list(dto);
  }
  @Get(':id') get(@Param('id', ParseIntPipe, PositiveIdPipe) id: number) {
    return this.purchases.get(id);
  }
  @Post()
  @ApiOperation({
    summary:
      'ADMIN: create an immutable pending purchase; does not change stock or record a payment',
  })
  create(@Body() dto: CreatePurchaseDto, @Req() req: AuthRequest) {
    return this.purchases.create(dto, req.user!.userId);
  }
  @Post(':id/receive')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'ADMIN: receive all items once, audit stock entries and optionally replace product costs',
  })
  receive(
    @Param('id', ParseIntPipe, PositiveIdPipe) id: number,
    @Body() dto: ReceivePurchaseDto,
    @Req() req: AuthRequest,
  ) {
    return this.purchases.transition(id, 'RECEIVE', dto, req.user!.userId);
  }
  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({
    summary: 'ADMIN: cancel a pending purchase without changing stock',
  })
  cancel(
    @Param('id', ParseIntPipe, PositiveIdPipe) id: number,
    @Body() dto: PurchaseOperationDto,
    @Req() req: AuthRequest,
  ) {
    return this.purchases.transition(id, 'CANCEL', dto, req.user!.userId);
  }
}
