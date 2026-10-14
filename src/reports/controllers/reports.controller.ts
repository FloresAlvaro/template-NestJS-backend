import { Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../../generated/prisma/client';
import { Roles } from '../../auth/decorators/access.decorators';
import { PaginationDto } from '../../common/dto/pagination.dto';
import {
  ReportPeriodDto,
  ReportSeriesDto,
  TopProductsReportDto,
} from '../dto/reports.dto';
import { ReportsService } from '../services/reports.service';

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
    summary:
      'Top 100 products by net units or amount in [from, to); ADMIN only',
  })
  topProducts(@Query() dto: TopProductsReportDto) {
    return this.reports.topProducts(dto);
  }

  @Get('sales-series')
  @ApiOperation({
    summary: 'Daily/monthly current net sales, America/La_Paz; ADMIN only',
  })
  salesSeries(@Query() dto: ReportSeriesDto) {
    return this.reports.salesSeries(dto);
  }

  @Get('sellers')
  @ApiOperation({
    summary: 'Top 100 sellers by current net sales in [from, to); ADMIN only',
  })
  sellers(@Query() dto: ReportPeriodDto) {
    return this.reports.sellers(dto);
  }

  @Get('payment-methods')
  @ApiOperation({
    summary: 'Gross receipts by operation date and payment method; ADMIN only',
  })
  paymentMethods(@Query() dto: ReportPeriodDto) {
    return this.reports.paymentMethods(dto);
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
