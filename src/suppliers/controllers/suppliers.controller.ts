import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '../../../generated/prisma/client';
import { Roles } from '../../auth/decorators/access.decorators';
import { PositiveIdPipe } from '../../common/pipes/positive-id.pipe';
import {
  CreateSupplierDto,
  ListSuppliersDto,
  UpdateSupplierDto,
} from '../dto/suppliers.dto';
import { SuppliersService } from '../services/suppliers.service';

@ApiTags('Suppliers')
@ApiCookieAuth('tienda_session')
@Roles(Role.ADMIN)
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}
  @Get()
  @ApiOperation({
    summary: 'ADMIN: list suppliers with search and active status',
  })
  list(@Query() dto: ListSuppliersDto) {
    return this.suppliers.list(dto);
  }
  @Get(':id') get(@Param('id', ParseIntPipe, PositiveIdPipe) id: number) {
    return this.suppliers.get(id);
  }
  @Post() create(@Body() dto: CreateSupplierDto) {
    return this.suppliers.create(dto);
  }
  @Patch(':id') update(
    @Param('id', ParseIntPipe, PositiveIdPipe) id: number,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.suppliers.update(id, dto);
  }
}
