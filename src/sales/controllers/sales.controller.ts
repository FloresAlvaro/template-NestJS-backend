import { SaleOperationsService } from '../services/sale-operations.service';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '../../../generated/prisma/client';
import { Roles } from '../../auth/decorators/access.decorators';
import type { AuthRequest } from '../../auth/types/auth.types';
import { PositiveIdPipe } from '../../common/pipes/positive-id.pipe';
import {
  CreateSaleDto,
  ListSalesDto,
  SaleOperationDto,
  SalePaymentDto,
  SaleReturnDto,
} from '../dto/sales.dto';
import { SalesService } from '../services/sales.service';
@ApiTags('Sales')
@ApiCookieAuth('tienda_session')
@Roles(Role.ADMIN, Role.SELLER)
@Controller('sales')
export class SalesController {
  constructor(
    private readonly sales: SalesService,
    private readonly operations: SaleOperationsService,
  ) {}
  @Get() list(@Query() dto: ListSalesDto) {
    return this.sales.list(dto);
  }
  @Get(':id') get(@Param('id', ParseIntPipe, PositiveIdPipe) id: number) {
    return this.sales.get(id);
  }
  @Post() create(@Body() dto: CreateSaleDto, @Req() req: AuthRequest) {
    return this.sales.create(dto, req.user!.userId);
  }

  @Post(':id/payments') payment(
    @Param('id', ParseIntPipe, PositiveIdPipe) id: number,
    @Body() dto: SalePaymentDto,
    @Req() req: AuthRequest,
  ) {
    return this.operations.execute(id, 'PAYMENT', dto, req.user!.userId);
  }
  @Roles(Role.ADMIN)
  @Post(':id/refunds')
  refund(
    @Param('id', ParseIntPipe, PositiveIdPipe) id: number,
    @Body() dto: SalePaymentDto,
    @Req() req: AuthRequest,
  ) {
    return this.operations.execute(id, 'REFUND', dto, req.user!.userId);
  }
  @Roles(Role.ADMIN)
  @Post(':id/returns')
  returnItems(
    @Param('id', ParseIntPipe, PositiveIdPipe) id: number,
    @Body() dto: SaleReturnDto,
    @Req() req: AuthRequest,
  ) {
    return this.operations.execute(id, 'RETURN', dto, req.user!.userId);
  }
  @Roles(Role.ADMIN)
  @Post(':id/cancel')
  cancel(
    @Param('id', ParseIntPipe, PositiveIdPipe) id: number,
    @Body() dto: SaleOperationDto,
    @Req() req: AuthRequest,
  ) {
    return this.operations.execute(id, 'CANCEL', dto, req.user!.userId);
  }
}
