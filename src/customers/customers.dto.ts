import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { PaginationDto } from '../common/dto/pagination.dto';
import { trimTransform } from '../common/utils/trim-transform.util';

export class CreateCustomerDto {
  @ApiProperty()
  @Transform(trimTransform)
  @IsString()
  @Length(2, 100)
  name!: string;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trimTransform)
  @IsString()
  @Length(1, 50)
  document?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trimTransform)
  @IsString()
  @Length(1, 30)
  phone?: string | null;
}
export class UpdateCustomerDto extends PartialType(CreateCustomerDto, {
  skipNullProperties: false,
}) {
  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}
export class ListCustomersDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimTransform)
  @IsString()
  @Length(0, 100)
  search?: string;
  @ApiPropertyOptional({ enum: ['all', 'active', 'inactive'] })
  @IsOptional()
  @IsIn(['all', 'active', 'inactive'])
  status: 'all' | 'active' | 'inactive' = 'all';
}
