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
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '../../../generated/prisma/client';
import { Roles } from '../../auth/decorators/access.decorators';
import { PositiveIdPipe } from '../../common/pipes/positive-id.pipe';
import { CustomersService } from '../services/customers.service';
import {
  CreateCustomerDto,
  ListCustomersDto,
  UpdateCustomerDto,
} from '../dto/customers.dto';
@ApiTags('Customers')
@ApiCookieAuth('tienda_session')
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}
  @Get() list(@Query() dto: ListCustomersDto) {
    return this.customers.list(dto);
  }
  @Get(':id') get(@Param('id', ParseIntPipe, PositiveIdPipe) id: number) {
    return this.customers.get(id);
  }
  @Post()
  @Roles(Role.ADMIN, Role.SELLER)
  create(@Body() dto: CreateCustomerDto) {
    return this.customers.create(dto);
  }
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe, PositiveIdPipe) id: number,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customers.update(id, dto);
  }
}
