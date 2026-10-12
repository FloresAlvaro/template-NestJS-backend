import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { trimTransform } from '../../common/utils/trim-transform.util';

export class CreateSubCategoryDto {
  @ApiProperty({
    example: 1,
    description:
      'ID of the parent category where the subcategory will be created',
    type: Number,
  })
  @IsInt()
  @IsPositive()
  categoryId!: number;

  @ApiProperty({
    example: 'Refrigerators',
    description: 'Subcategory name. Must be unique inside the same category',
    minLength: 3,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'Name must be at least 3 characters long' })
  @MaxLength(100, { message: 'Name must not exceed 100 characters' })
  @Transform(trimTransform)
  name!: string;

  @ApiPropertyOptional({
    example: 'Refrigerators and freezers',
    description: 'Optional subcategory description',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(trimTransform)
  description?: string;
}
