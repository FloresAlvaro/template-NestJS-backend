import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { trimTransform } from '../../common/utils/trim-transform.util';
export class SaleLineDto {
  @ApiProperty() @IsInt() @Min(1) @Max(2147483647) productId!: number;
  @ApiProperty() @IsInt() @Min(1) @Max(2147483647) quantity!: number;
  @ApiProperty({
    description:
      'Price seen by the customer or seller; a changed price requires confirmation again',
  })
  @IsString()
  @Matches(/^(0|[1-9]\d{0,15})\.\d{2}$/)
  expectedUnitPrice!: string;
}
export class CreateSaleDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  @ApiPropertyOptional({
    description:
      'One controlled promotion; requires expectedPromotionVersion and expectedTotal',
  })
  promotionId?: number;
  @ValidateIf(
    (object: CreateSaleDto, value: unknown) =>
      object.promotionId !== undefined || value !== undefined,
  )
  @IsInt()
  @Min(1)
  @Max(2147483647)
  @ApiPropertyOptional()
  expectedPromotionVersion?: number;
  @ValidateIf(
    (object: CreateSaleDto, value: unknown) =>
      object.promotionId !== undefined || value !== undefined,
  )
  @IsString()
  @Matches(/^(0|[1-9]\d{0,15})\.\d{2}$/)
  @ApiPropertyOptional()
  expectedTotal?: string;

  @ApiProperty() @IsUUID('4') requestId!: string;
  @ApiProperty() @IsInt() @Min(1) @Max(2147483647) customerId!: number;
  @ApiProperty({ type: [SaleLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SaleLineDto)
  items!: SaleLineDto[];
}
export class ListSalesDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  customerId?: number;
  @ApiPropertyOptional({
    description: 'Customer name/document or sold SKU/product name',
  })
  @IsOptional()
  @Transform(trimTransform)
  @IsString()
  @Length(0, 150)
  search?: string;
}

export class SaleOperationDto {
  @ApiProperty() @IsUUID('4') requestId!: string;
  @ApiProperty()
  @Transform(trimTransform)
  @IsString()
  @Length(3, 500)
  reason!: string;
}
export enum PaymentMethodDto {
  CASH = 'CASH',
  CARD = 'CARD',
  TRANSFER = 'TRANSFER',
}
export class SalePaymentDto extends SaleOperationDto {
  @ApiPropertyOptional({
    description:
      'Explicit open shift; otherwise the actor’s open shift is used. Legacy operations without an open shift remain unassigned.',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  cashShiftId?: number;

  @ApiProperty()
  @IsString()
  @Matches(/^(0|[1-9]\d{0,15})\.\d{2}$/)
  amount!: string;
  @ApiProperty({ enum: PaymentMethodDto })
  @IsEnum(PaymentMethodDto)
  method!: PaymentMethodDto;
}
export class SaleReturnLineDto {
  @ApiProperty() @IsInt() @Min(1) @Max(2147483647) saleItemId!: number;
  @ApiProperty() @IsInt() @Min(1) @Max(2147483647) quantity!: number;
}
export class SaleReturnDto extends SaleOperationDto {
  @ApiProperty({ type: [SaleReturnLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SaleReturnLineDto)
  items!: SaleReturnLineDto[];
}
