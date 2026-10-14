import { SESSION_COOKIE, readSessionToken } from '../security/session-cookie';
import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Req,
  Res,
  HttpCode,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiCookieAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { Role } from '../../../generated/prisma/client';
import { AuthThrottle, Public, Roles } from '../decorators/access.decorators';
import type { AuthRequest } from '../types/auth.types';
import { AuthService } from '../services/auth.service';
import {
  LoginDto,
  RegisterDto,
  ProfileDto,
  PasswordDto,
  CustomerProfileDto,
} from '../dto/auth.dto';
import { tokenHash } from '../security/password';

@ApiTags('Authentication')
@ApiCookieAuth('tienda_session')
@Roles(Role.ADMIN, Role.SELLER, Role.CUSTOMER)
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}
  private cookieOptions() {
    return {
      httpOnly: true,
      secure:
        this.config.get<string>(
          'COOKIE_SECURE',
          process.env.NODE_ENV === 'production' ? 'true' : 'false',
        ) === 'true',
      sameSite: 'lax' as const,
      path: '/',
    };
  }
  @Public()
  @AuthThrottle()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }
  @Public()
  @AuthThrottle()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
    @Req() req: AuthRequest,
  ) {
    const result = await this.auth.login(dto);
    // A successful login replaces the browser's previous session.
    const previous = readSessionToken(req.headers.cookie);
    if (previous) {
      await this.auth.logout(tokenHash(previous));
    }
    res.cookie(SESSION_COOKIE, result.token, {
      ...this.cookieOptions(),
      expires: result.expiresAt,
    });
    return result.user;
  }
  @Get('me')
  me(@Req() req: AuthRequest) {
    return req.user;
  }
  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
    return this.auth.logout(req.sessionHash!);
  }
  @Patch('profile')
  profile(@Req() req: AuthRequest, @Body() dto: ProfileDto) {
    return this.auth.profile(req.user!.userId, dto.name);
  }
  @Post('password')
  @HttpCode(200)
  async password(
    @Req() req: AuthRequest,
    @Body() dto: PasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.changePassword(
      req.user!.userId,
      dto.currentPassword,
      dto.newPassword,
    );
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
    return result;
  }
  @Roles(Role.CUSTOMER)
  @Get('customer')
  customer(@Req() req: AuthRequest) {
    return this.auth.customer(req.user!.userId);
  }
  @Roles(Role.CUSTOMER)
  @Patch('customer')
  customerUpdate(@Req() req: AuthRequest, @Body() dto: CustomerProfileDto) {
    return this.auth.updateCustomer(req.user!.userId, dto);
  }
}
