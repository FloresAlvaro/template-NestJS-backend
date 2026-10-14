import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StockMovementType } from '../../../generated/prisma/client';
import { trimTransform } from '../../common/utils/trim-transform.util';

export class InventorySettingsDto {
  @ApiProperty({ minimum: 0, maximum: 2147483647 })
  @IsInt()
  @Min(0)
  @Max(2147483647)
  minStock!: number;
}

export class CreateStockMovementDto {
  @ApiProperty({ enum: StockMovementType })
  @IsEnum(StockMovementType)
  type!: StockMovementType;

  @ApiProperty({
    description: 'Units for ENTRY/EXIT; final counted quantity for ADJUSTMENT',
    minimum: 0,
    maximum: 2147483647,
  })
  @IsInt()
  @Min(0)
  @Max(2147483647)
  quantity!: number;

  @ApiProperty({ minLength: 3, maxLength: 500 })
  @Transform(trimTransform)
  @IsString()
  @Length(3, 500)
  reason!: string;

  @ApiPropertyOptional({
    description: 'Required for ADJUSTMENT; rejects stale stock counts',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2147483647)
  expectedQuantity?: number;
}
