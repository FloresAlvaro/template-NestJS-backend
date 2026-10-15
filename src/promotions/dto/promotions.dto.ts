import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsInt,
  IsISO8601,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { trimTransform } from '../../common/utils/trim-transform.util';
export class PromotionDto {
  @Transform(trimTransform)
  @IsString()
  @Matches(/^[A-Z0-9_-]{3,40}$/)
  @ApiProperty()
  code!: string;
  @ApiProperty()
  @Transform(trimTransform)
  @IsString()
  @Length(3, 150)
  name!: string;
  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(10000)
  percentBps!: number;
  @ApiProperty()
  @Matches(/[Tt].*(?:[Zz]|[+-]\d{2}:\d{2})$/)
  @IsISO8601({ strict: true })
  startsAt!: string;
  @ApiProperty()
  @Matches(/[Tt].*(?:[Zz]|[+-]\d{2}:\d{2})$/)
  @IsISO8601({ strict: true })
  endsAt!: string;
  @ApiProperty()
  @IsBoolean()
  isActive!: boolean;
  @ApiProperty()
  @IsBoolean()
  allowSeller!: boolean;
  @ApiProperty()
  @IsString()
  @Matches(/^(0|[1-9]\d{0,15})\.\d{2}$/)
  minSubtotal!: string;
}

import { PaginationDto } from '../../common/dto/pagination.dto';
export class PromotionListDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['true', 'false'])
  available?: string;
  @IsOptional()
  @Transform(trimTransform)
  @IsString()
  @Length(0, 150)
  @ApiPropertyOptional()
  search?: string;
}
