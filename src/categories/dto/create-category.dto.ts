import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCategoryDto {
  @ApiProperty({
    example: 'Electronics',
    description: 'The name of the category',
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'Name must be at least 3 characters long' })
  @MaxLength(100, { message: 'Name must not exceed 100 characters' })
  @Transform(
    ({ value }) =>
      (typeof value === 'string' ? value.trim() : value) as string | undefined,
  )
  name!: string;

  @ApiProperty({
    example: 'Electronic devices and accessories',
    description: 'Optional description of the category',
    type: String,
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Description must not exceed 500 characters' })
  @Transform(
    ({ value }) =>
      (typeof value === 'string' ? value.trim() : value) as string | undefined,
  )
  description?: string;
}
