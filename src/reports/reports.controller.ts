import { Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../generated/prisma/client';
import { Roles } from '../auth/access.decorators';
import { PaginationDto } from '../common/dto/pagination.dto';
import { ReportPeriodDto } from './reports.dto';
import { ReportsService } from './reports.service';

@ApiTags('Reports')
@ApiCookieAuth('tienda_session')
@Roles(Role.ADMIN)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('sales')
  @ApiOperation({
    summary: 'Current balances of sales created in [from, to); ADMIN only',
  })
  sales(@Query() dto: ReportPeriodDto) {
    return this.reports.sales(dto);
  }

  @Get('top-products')
  @ApiOperation({
    summary: 'Top 100 products by net units sold in [from, to); ADMIN only',
  })
  topProducts(@Query() dto: ReportPeriodDto) {
    return this.reports.topProducts(dto);
  }

  @Get('inventory')
  @ApiOperation({ summary: 'Current sellable inventory summary; ADMIN only' })
  inventory() {
    return this.reports.inventory();
  }

  @Get('low-stock')
  @ApiOperation({
    summary:
      'Paginated sellable products at or below minimum stock; ADMIN only',
  })
  lowStock(@Query() dto: PaginationDto) {
    return this.reports.lowStock(dto);
  }
}
