import { ApiProperty } from '@nestjs/swagger';

export class Category {
  @ApiProperty({
    example: 1,
    description: 'Unique identifier for the category',
    type: Number,
  })
  categoryId!: number;

  @ApiProperty({
    example: 'Electronics',
    description: 'The name of the category',
    type: String,
  })
  name!: string;

  @ApiProperty({
    example: 'Electronic devices and accessories',
    description: 'Optional description of the category',
    type: String,
    required: false,
  })
  description?: string | null;

  @ApiProperty({
    example: true,
    description: 'Whether the category is active or not',
    type: Boolean,
  })
  isActive!: boolean;

  @ApiProperty({
    example: '2024-01-15T10:30:00Z',
    description: 'The date when the category was created',
    type: Date,
  })
  createdAt!: Date;

  @ApiProperty({
    example: '2024-01-20T14:45:00Z',
    description: 'The date when the category was last updated',
    type: Date,
  })
  updatedAt!: Date;
}
