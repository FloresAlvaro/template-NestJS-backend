import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubCategory {
  @ApiProperty({
    example: 1,
    description: 'Unique primary key identifier for the subcategory',
  })
  subCategoryId!: number;

  @ApiProperty({ example: 1, description: 'ID of the parent category' })
  categoryId!: number;

  @ApiProperty({
    example: 'Refrigerators',
    description: 'The name of the subcategory',
  })
  name!: string;

  @ApiPropertyOptional({
    example: 'Refrigerators and freezers',
    description: 'Optional subcategory description',
  })
  description?: string;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ example: '2024-01-15T10:30:00Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2024-01-20T14:45:00Z' })
  updatedAt!: Date;
}
