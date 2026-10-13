import { PaginationDto } from '../../common/dto/pagination.dto';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListProductsDto extends PaginationDto {
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
