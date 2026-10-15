import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsString, IsIn } from 'class-validator';

export class ReportPeriodDto {
  @ApiProperty({ example: '2026-10-01T00:00:00Z' })
  @IsString()
  @IsISO8601({ strict: true })
  from!: string;

  @ApiProperty({ example: '2026-11-01T00:00:00Z' })
  @IsString()
  @IsISO8601({ strict: true })
  to!: string;
}

export class ReportSeriesDto extends ReportPeriodDto {
  @ApiPropertyOptional({ enum: ['DAY', 'MONTH'], default: 'DAY' })
  @IsIn(['DAY', 'MONTH'])
  group: 'DAY' | 'MONTH' = 'DAY';
}

export class TopProductsReportDto extends ReportPeriodDto {
  @ApiPropertyOptional({ enum: ['UNITS', 'AMOUNT'], default: 'UNITS' })
  @IsIn(['UNITS', 'AMOUNT'])
  metric: 'UNITS' | 'AMOUNT' = 'UNITS';
}
