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
