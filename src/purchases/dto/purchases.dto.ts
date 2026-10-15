import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PurchaseStatus } from '../../../generated/prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { trimTransform } from '../../common/utils/trim-transform.util';

export class PurchaseLineDto {
  @ApiProperty() @IsInt() @Min(1) @Max(2147483647) productId!: number;
  @ApiProperty() @IsInt() @Min(1) @Max(2147483647) quantity!: number;
  @ApiProperty({ example: '10.00' })
  @IsString()
  @Matches(/^(0|[1-9]\d{0,15})\.\d{2}$/)
  unitCost!: string;
}
export class CreatePurchaseDto {
  @ApiProperty() @IsUUID('4') requestId!: string;
  @ApiProperty() @IsInt() @Min(1) @Max(2147483647) supplierId!: number;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trimTransform)
  @IsString()
  @Length(1, 100)
  reference?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trimTransform)
  @IsString()
  @Length(1, 1000)
  notes?: string | null;
  @ApiProperty({ type: [PurchaseLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PurchaseLineDto)
  items!: PurchaseLineDto[];
}
export class PurchaseOperationDto {
  @ApiProperty() @IsUUID('4') requestId!: string;
  @ApiProperty()
  @Transform(trimTransform)
  @IsString()
  @Length(3, 500)
  reason!: string;
}
export class ReceivePurchaseDto extends PurchaseOperationDto {
  @ApiPropertyOptional({ default: false })
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  updateCost = false;
}
export class ListPurchasesDto extends PaginationDto {
  @ApiPropertyOptional({ enum: PurchaseStatus })
  @IsOptional()
  @IsEnum(PurchaseStatus)
  status?: PurchaseStatus;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  supplierId?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimTransform)
  @IsString()
  @Length(0, 150)
  search?: string;
}
