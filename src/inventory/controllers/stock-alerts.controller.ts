import { Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/access.decorators';
import { StockAlertsDto } from '../dto/stock-alerts.dto';
import { StockAlertsService } from '../services/stock-alerts.service';
@ApiTags('Inventory')
@ApiCookieAuth('tienda_session')
@Roles('ADMIN', 'SELLER')
@Controller('inventory/alerts')
export class StockAlertsController {
  constructor(private readonly alerts: StockAlertsService) {}
  @Get() list(@Query() dto: StockAlertsDto) {
    return this.alerts.list(dto);
  }
}
