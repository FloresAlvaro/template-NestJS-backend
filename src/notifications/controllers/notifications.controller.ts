import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  ParseIntPipe,
  Query,
  Req,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/access.decorators';
import type { AuthRequest } from '../../auth/types/auth.types';
import { PositiveIdPipe } from '../../common/pipes/positive-id.pipe';
import { NotificationListDto } from '../dto/notifications.dto';
import { NotificationsService } from '../services/notifications.service';
@ApiTags('Notifications')
@ApiCookieAuth('tienda_session')
@Roles('ADMIN', 'CUSTOMER')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notices: NotificationsService) {}
  @Get() list(@Query() dto: NotificationListDto, @Req() req: AuthRequest) {
    return this.notices.list(dto, req.user!);
  }
  @Patch(':id/read') read(
    @Param('id', ParseIntPipe, PositiveIdPipe) id: number,
    @Req() req: AuthRequest,
  ) {
    return this.notices.read(id, req.user!);
  }
  @Roles('ADMIN') @Post(':id/retry') retry(
    @Param('id', ParseIntPipe, PositiveIdPipe) id: number,
  ) {
    return this.notices.retry(id);
  }
}
