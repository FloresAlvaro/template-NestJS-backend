import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProductEntity {
  @ApiProperty({ example: 0, minimum: 0 })
  quantity!: number;
  @ApiProperty({ example: 0, minimum: 0 })
  minStock!: number;
  @ApiProperty({ enum: ['OUT_OF_STOCK', 'LOW_STOCK', 'AVAILABLE'] })
  stockStatus!: string;
  @ApiProperty({ example: 1 })
  productId!: number;
  @ApiProperty({ example: 1 })
  subCategoryId!: number;
  @ApiProperty({ example: 'Teclado USB' })
  name!: string;
  @ApiProperty({ example: 'TEC-001' })
  sku!: string;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '0123456789012',
  })
  barcode!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  description!: string | null;
  @ApiProperty({ example: '80.00', type: String })
  cost!: string;
  @ApiProperty({ example: '120.50', type: String })
  salePrice!: string;
  @ApiProperty({ example: true })
  isActive!: boolean;
  @ApiProperty({ type: Date })
  createdAt!: Date;
  @ApiProperty({ type: Date })
  updatedAt!: Date;
}

export class ProductPageEntity {
  @ApiProperty({ type: [ProductEntity] })
  items!: ProductEntity[];
  @ApiProperty({ example: 1 })
  total!: number;
  @ApiProperty({ example: 1 })
  page!: number;
  @ApiProperty({ example: 20 })
  limit!: number;
}
