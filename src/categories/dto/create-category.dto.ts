import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCategoryDto {
  @ApiProperty({
    example: 'Electronics',
    description: 'The name of the category',
    type: String,
  })
  @IsString()
  name!: string;

  @ApiProperty({
    example: 'Electronic devices and accessories',
    description: 'Optional description of the category',
    type: String,
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;
}
