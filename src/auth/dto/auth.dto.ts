import { trimTransform } from '../../common/utils/trim-transform.util';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
export class LoginDto {
  @ApiProperty()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @Length(3, 254)
  email!: string;
  @ApiProperty({ minLength: 12, maxLength: 128 })
  @IsString()
  @Length(1, 128)
  password!: string;
}
export class RegisterDto extends LoginDto {
  @ApiProperty()
  @Transform(trimTransform)
  @IsString()
  @Length(2, 100)
  name!: string;
  @ApiProperty({ minLength: 12, maxLength: 128 })
  @IsString()
  @Length(12, 128)
  declare password: string;
}
export class ProfileDto {
  @ApiProperty()
  @Transform(trimTransform)
  @IsString()
  @Length(2, 100)
  name!: string;
}
export class PasswordDto {
  @ApiProperty()
  @IsString()
  @Length(1, 128)
  currentPassword!: string;
  @ApiProperty()
  @IsString()
  @Length(12, 128)
  newPassword!: string;
}
export class CustomerProfileDto {
  @IsOptional()
  @IsString()
  @Length(0, 50)
  document?: string | null;
  @IsOptional()
  @IsString()
  @Length(0, 30)
  phone?: string | null;
}
