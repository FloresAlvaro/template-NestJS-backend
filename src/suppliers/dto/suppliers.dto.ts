import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  ValidateIf,
} from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { trimTransform } from '../../common/utils/trim-transform.util';

export class CreateSupplierDto {
  @ApiProperty()
  @Transform(trimTransform)
  @IsString()
  @Length(2, 150)
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
  @Length(1, 100)
  contactName?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trimTransform)
  @IsEmail()
  @Length(1, 254)
  email?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trimTransform)
  @IsString()
  @Length(1, 30)
  phone?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trimTransform)
  @IsString()
  @Length(1, 300)
  address?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trimTransform)
  @IsString()
  @Length(1, 1000)
  notes?: string | null;
}
export class UpdateSupplierDto extends PartialType(CreateSupplierDto, {
  skipNullProperties: false,
}) {
  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}
export class ListSuppliersDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimTransform)
  @IsString()
  @Length(0, 150)
  search?: string;
  @ApiPropertyOptional({ enum: ['all', 'active', 'inactive'] })
  @IsOptional()
  @IsIn(['all', 'active', 'inactive'])
  status: 'all' | 'active' | 'inactive' = 'all';
}
