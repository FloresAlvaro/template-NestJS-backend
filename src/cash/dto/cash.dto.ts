import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  ValidateIf,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { trimTransform } from '../../common/utils/trim-transform.util';
export class RegisterDto {
  @ApiProperty()
  @Transform(trimTransform)
  @IsString()
  @Length(1, 100)
  name!: string;
  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}
export class CashRequestDto {
  @ApiProperty() @IsUUID('4') requestId!: string;
}
export class OpenShiftDto extends CashRequestDto {
  @ApiProperty() @IsInt() @Min(1) @Max(2147483647) registerId!: number;
  @ApiProperty()
  @IsString()
  @Matches(/^(0|[1-9]\d{0,15})\.\d{2}$/)
  openingAmount!: string;
}
export class ManualCashDto extends CashRequestDto {
  @ApiProperty({ enum: ['CASH_IN', 'CASH_OUT'] })
  @IsIn(['CASH_IN', 'CASH_OUT'])
  kind!: 'CASH_IN' | 'CASH_OUT';
  @ApiProperty()
  @IsString()
  @Matches(/^(0|[1-9]\d{0,15})\.\d{2}$/)
  amount!: string;
  @ApiProperty()
  @Transform(trimTransform)
  @IsString()
  @Length(3, 500)
  reason!: string;
}
export class CloseShiftDto extends CashRequestDto {
  @ApiProperty()
  @IsString()
  @Matches(/^(0|[1-9]\d{0,15})\.\d{2}$/)
  countedAmount!: string;
  @ApiProperty()
  @IsInt()
  @Min(0)
  @Max(2147483647)
  expectedLastMovementId!: number;
  @ApiProperty()
  @Transform(trimTransform)
  @IsString()
  @Length(3, 500)
  reason!: string;
}
export class ListShiftsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ['OPEN', 'CLOSED'] })
  @IsOptional()
  @IsIn(['OPEN', 'CLOSED'])
  status?: 'OPEN' | 'CLOSED';
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  registerId?: number;
}
