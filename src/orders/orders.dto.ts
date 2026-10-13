import { ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { IsEnum, ValidateIf } from 'class-validator';
import { OrderStatus } from '../../generated/prisma/client';
import { PaginationDto } from '../common/dto/pagination.dto';
import { CreateSaleDto, SaleOperationDto } from '../sales/sales.dto';

export class CreateOrderDto extends PickType(CreateSaleDto, [
  'requestId',
  'items',
] as const) {}
export class OrderOperationDto extends SaleOperationDto {}
export class ListOrdersDto extends PaginationDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}
