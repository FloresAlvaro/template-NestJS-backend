import { Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/access.decorators';
import { AuditService } from '../services/audit.service';
import { AuditListDto } from '../dto/audit.dto';
@ApiTags('Audit')
@ApiCookieAuth('tienda_session')
@Roles('ADMIN')
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}
  @Get() list(@Query() dto: AuditListDto) {
    return this.audit.list(dto);
  }
}
