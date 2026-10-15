import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/access.decorators';
import type { AuthRequest } from '../../auth/types/auth.types';
import { PositiveIdPipe } from '../../common/pipes/positive-id.pipe';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { CashService } from '../services/cash.service';
import {
  CloseShiftDto,
  ListShiftsDto,
  ManualCashDto,
  OpenShiftDto,
  RegisterDto,
} from '../dto/cash.dto';
@ApiTags('Cash')
@ApiCookieAuth('tienda_session')
@Roles('ADMIN', 'SELLER')
@Controller('cash')
export class CashController {
  constructor(private readonly cash: CashService) {}
  @Get('registers') registers(@Req() req: AuthRequest) {
    return this.cash.registers(req.user!);
  }
  @Post('registers') @Roles('ADMIN') createRegister(@Body() dto: RegisterDto) {
    return this.cash.register(dto);
  }
  @Patch('registers/:id') @Roles('ADMIN') updateRegister(
    @Param('id', ParseIntPipe, PositiveIdPipe) id: number,
    @Body() dto: RegisterDto,
  ) {
    return this.cash.register(dto, id);
  }
  @Get('shifts/current') current(@Req() req: AuthRequest) {
    return this.cash.current(req.user!);
  }
  @Get('shifts') list(@Query() dto: ListShiftsDto, @Req() req: AuthRequest) {
    return this.cash.list(dto, req.user!);
  }
  @Post('shifts') open(@Body() dto: OpenShiftDto, @Req() req: AuthRequest) {
    return this.cash.open(dto, req.user!);
  }
  @Get('shifts/:id') get(
    @Param('id', ParseIntPipe, PositiveIdPipe) id: number,
    @Req() req: AuthRequest,
  ) {
    return this.cash.get(id, req.user!);
  }
  @Get('shifts/:id/movements') history(
    @Param('id', ParseIntPipe, PositiveIdPipe) id: number,
    @Query() dto: PaginationDto,
    @Req() req: AuthRequest,
  ) {
    return this.cash.movements(id, dto, req.user!);
  }
  @Post('shifts/:id/movements') move(
    @Param('id', ParseIntPipe, PositiveIdPipe) id: number,
    @Body() dto: ManualCashDto,
    @Req() req: AuthRequest,
  ) {
    return this.cash.move(id, dto, req.user!);
  }
  @Post('shifts/:id/close') close(
    @Param('id', ParseIntPipe, PositiveIdPipe) id: number,
    @Body() dto: CloseShiftDto,
    @Req() req: AuthRequest,
  ) {
    return this.cash.close(id, dto, req.user!);
  }
}
