import { PaginationDto } from '../../common/dto/pagination.dto';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
} from 'class-validator';
import { trimTransform } from '../../common/utils/trim-transform.util';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListProductsDto extends PaginationDto {
  @ApiPropertyOptional({
    enum: ['all', 'AVAILABLE', 'LOW_STOCK', 'OUT_OF_STOCK'],
    default: 'all',
  })
  @IsOptional()
  @IsIn(['all', 'AVAILABLE', 'LOW_STOCK', 'OUT_OF_STOCK'])
  availability: 'all' | 'AVAILABLE' | 'LOW_STOCK' | 'OUT_OF_STOCK' = 'all';

  @ApiPropertyOptional({
    description: 'Partial name or SKU, case insensitive',
    maxLength: 150,
  })
  @IsOptional()
  @Transform(trimTransform)
  @IsString()
  @MaxLength(150)
  search?: string;

  @ApiPropertyOptional({ enum: ['active', 'inactive', 'all'], default: 'all' })
  @IsOptional()
  @IsIn(['active', 'inactive', 'all'])
  status: 'active' | 'inactive' | 'all' = 'all';

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  subCategoryId?: number;
}
