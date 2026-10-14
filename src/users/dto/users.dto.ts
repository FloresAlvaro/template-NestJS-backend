import {
  IsEnum,
  IsBoolean,
  IsString,
  Length,
  ValidateIf,
} from 'class-validator';
import { PartialType, PickType } from '@nestjs/swagger';
import { RegisterDto } from '../../auth/dto/auth.dto';
import { Role } from '../../../generated/prisma/client';
export class CreateUserDto extends RegisterDto {
  @IsEnum(Role)
  role!: Role;
}
export class UpdateUserDto extends PartialType(
  PickType(RegisterDto, ['name'] as const),
  { skipNullProperties: false },
) {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(Role)
  role?: Role;
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}
export class ResetPasswordDto {
  @IsString()
  @Length(12, 128)
  password!: string;
}
