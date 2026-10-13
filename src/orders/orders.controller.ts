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
import { Role } from '../../generated/prisma/client';
import { Roles } from '../auth/access.decorators';
import type { AuthRequest } from '../auth/auth.types';
import { PositiveIdPipe } from '../common/pipes/positive-id.pipe';
import { CreateOrderDto, ListOrdersDto, OrderOperationDto } from './orders.dto';
import { OrdersService } from './orders.service';

@ApiTags('Orders')
@ApiCookieAuth('tienda_session')
@Roles(Role.ADMIN, Role.SELLER, Role.CUSTOMER)
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}
  @Post()
  @Roles(Role.CUSTOMER)
  @ApiOperation({
    summary:
      'CUSTOMER: create an idempotent pickup order and reserve stock; client comes from the session',
  })
  create(@Body() dto: CreateOrderDto, @Req() req: AuthRequest) {
    return this.orders.create(dto, req.user!.userId);
  }
  @Get()
  @ApiOperation({ summary: 'List orders; CUSTOMER sees only their own orders' })
  list(@Query() dto: ListOrdersDto, @Req() req: AuthRequest) {
    return this.orders.list(dto, req.user!);
  }
  @Get(':id')
  @ApiOperation({
    summary:
      'Read an order and its payment balances; CUSTOMER is restricted to the owner',
  })
  get(
    @Param('id', ParseIntPipe, PositiveIdPipe) id: number,
    @Req() req: AuthRequest,
  ) {
    return this.orders.get(id, req.user!);
  }
  @Post(':id/confirm')
  @HttpCode(200)
  @Roles(Role.ADMIN, Role.SELLER)
  @ApiOperation({
    summary:
      'ADMIN/SELLER: convert an unexpired pending order to a sale at its original prices',
  })
  confirm(
    @Param('id', ParseIntPipe, PositiveIdPipe) id: number,
    @Body() dto: OrderOperationDto,
    @Req() req: AuthRequest,
  ) {
    return this.orders.transition(id, 'CONFIRM', dto, req.user!.userId);
  }
  @Post(':id/ready')
  @HttpCode(200)
  @Roles(Role.ADMIN, Role.SELLER)
  @ApiOperation({
    summary: 'ADMIN/SELLER: mark a confirmed pickup order ready',
  })
  ready(
    @Param('id', ParseIntPipe, PositiveIdPipe) id: number,
    @Body() dto: OrderOperationDto,
    @Req() req: AuthRequest,
  ) {
    return this.orders.transition(id, 'READY', dto, req.user!.userId);
  }
  @Post(':id/complete')
  @HttpCode(200)
  @Roles(Role.ADMIN, Role.SELLER)
  @ApiOperation({
    summary:
      'ADMIN/SELLER: complete a ready order only when the sale is fully paid',
  })
  complete(
    @Param('id', ParseIntPipe, PositiveIdPipe) id: number,
    @Body() dto: OrderOperationDto,
    @Req() req: AuthRequest,
  ) {
    return this.orders.transition(id, 'COMPLETE', dto, req.user!.userId);
  }
  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Cancel a pending order and release its reservation; CUSTOMER can cancel only their own. Confirmed sales use the ADMIN sale cancellation route.',
  })
  cancel(
    @Param('id', ParseIntPipe, PositiveIdPipe) id: number,
    @Body() dto: OrderOperationDto,
    @Req() req: AuthRequest,
  ) {
    return this.orders.transition(id, 'CANCEL', dto, req.user!.userId);
  }
}
