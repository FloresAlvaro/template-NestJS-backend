import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Res,
  SetMetadata,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../decorators/access.decorators';
import {
  ForgotPasswordDto,
  ResetPasswordDto,
} from '../dto/password-recovery.dto';
import { PasswordRecoveryService } from '../services/password-recovery.service';
import { recoveryCsp, recoveryPage } from '../templates/password-recovery.page';
import { SESSION_COOKIE } from '../security/session-cookie';

@Public()
@SetMetadata('recoveryThrottle', true)
@ApiTags('Password recovery')
@Controller('auth')
export class PasswordRecoveryController {
  constructor(private readonly recovery: PasswordRecoveryService) {}

  @Post('forgot-password')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Request a single-use recovery email; same response for unknown/inactive accounts',
  })
  @ApiOkResponse({
    schema: { type: 'object', properties: { message: { type: 'string' } } },
  })
  request(@Body() dto: ForgotPasswordDto) {
    return this.recovery.request(dto.email);
  }

  @Post('reset-password')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Consume a recovery token and revoke all account sessions',
  })
  async reset(
    @Body() dto: ResetPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.recovery.reset(dto.token, dto.newPassword);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return result;
  }

  @Get('reset-password')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', recoveryCsp)
  @ApiOperation({
    summary: 'Standalone recovery form, usable without frontend integration',
  })
  page() {
    return recoveryPage;
  }
}
