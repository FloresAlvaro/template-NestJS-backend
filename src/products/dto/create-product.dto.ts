import { Transform } from 'class-transformer';
import {
  IsInt,
  IsPositive,
  Max,
  IsString,
  Length,
  IsOptional,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { trimTransform } from '../../common/utils/trim-transform.util';

export class CreateProductDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @IsPositive()
  @Max(2147483647)
  subCategoryId!: number;

  @ApiProperty({ example: 'Teclado USB', minLength: 3, maxLength: 150 })
  @Transform(trimTransform)
  @IsString()
  @Length(3, 150)
  name!: string;

  @ApiProperty({
    example: 'TEC-001',
    description: 'Unique SKU, trimmed and stored in uppercase',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Length(1, 64)
  @Matches(/^[A-Z0-9][A-Z0-9._-]*$/)
  sku!: string;

  @ApiPropertyOptional({ example: '0123456789012', nullable: true })
  @IsOptional()
  @Transform(trimTransform)
  @IsString()
  @Length(1, 64)
  @Matches(/^[A-Za-z0-9-]+$/)
  barcode?: string | null;

  @ApiPropertyOptional({ maxLength: 1000, nullable: true })
  @IsOptional()
  @Transform(trimTransform)
  @IsString()
  @Length(0, 1000)
  description?: string | null;

  @ApiProperty({
    example: '80.00',
    type: String,
    description:
      'Nonnegative decimal string; up to 16 integer digits and 2 decimal places',
  })
  @IsString()
  @Matches(/^(0|[1-9]\d{0,15})(\.\d{1,2})?$/)
  cost!: string;

  @ApiProperty({
    example: '120.50',
    type: String,
    description:
      'Nonnegative decimal string; up to 16 integer digits and 2 decimal places',
  })
  @IsString()
  @Matches(/^(0|[1-9]\d{0,15})(\.\d{1,2})?$/)
  salePrice!: string;
}
