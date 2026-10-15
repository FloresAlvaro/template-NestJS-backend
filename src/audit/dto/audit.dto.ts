import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
export class AuditListDto extends PaginationDto {
  @IsOptional()
  @IsIn([
    'Category',
    'SubCategory',
    'Product',
    'ProductImage',
    'User',
    'Inventory',
    'Supplier',
    'Promotion',
  ])
  @ApiPropertyOptional()
  entity?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  @ApiPropertyOptional()
  entityId?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  @ApiPropertyOptional()
  actorId?: number;
}
