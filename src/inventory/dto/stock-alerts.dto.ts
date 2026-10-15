import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { trimTransform } from '../../common/utils/trim-transform.util';
export class StockAlertsDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimTransform)
  @IsString()
  @Length(0, 150)
  search?: string;
  @ApiPropertyOptional({ enum: ['OUT_OF_STOCK', 'LOW_STOCK'] })
  @IsOptional()
  @IsIn(['OUT_OF_STOCK', 'LOW_STOCK'])
  severity?: 'OUT_OF_STOCK' | 'LOW_STOCK';
}
