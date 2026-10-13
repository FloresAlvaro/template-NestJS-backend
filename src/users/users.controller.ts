import { PaginationDto } from '../common/dto/pagination.dto';
import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Param,
  ParseIntPipe,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiCookieAuth } from '@nestjs/swagger';
import { Roles } from '../auth/access.decorators';
import { Role } from '../../generated/prisma/client';
import type { AuthRequest } from '../auth/auth.types';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, ResetPasswordDto } from './users.dto';
import { PositiveIdPipe } from '../common/pipes/positive-id.pipe';
@ApiTags('Users')
@ApiCookieAuth('tienda_session')
@Roles(Role.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @Get()
  list(@Query() dto: PaginationDto) {
    return this.users.list(dto);
  }
  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe, PositiveIdPipe) id: number,
    @Body() dto: UpdateUserDto,
    @Req() req: AuthRequest,
  ) {
    return this.users.update(id, dto, req.user!.userId);
  }
  @Post(':id/password')
  reset(
    @Param('id', ParseIntPipe, PositiveIdPipe) id: number,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.users.resetPassword(id, dto.password);
  }
}
