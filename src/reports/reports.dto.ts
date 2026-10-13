import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsString } from 'class-validator';

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
