import { IsEmail, IsNotEmpty, MinLength, IsString, IsOptional, MaxLength, IsUrl, IsInt, IsObject, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123' })
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 'John Doe' })
  @IsNotEmpty()
  fullName: string;
}

export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123' })
  @IsNotEmpty()
  password: string;
}

export class UpdateProfileDto {
  @ApiProperty({ example: 'John Doe', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fullName?: string;

  @ApiProperty({ example: 'https://avatar.url', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  avatar?: string;

  @ApiProperty({ example: 'I care about my city', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  cityId?: number;

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  areaId?: number;
}

export class NotificationSettingsDto {
  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  criticalOnly?: boolean;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  statusUpdates?: boolean;
}

export class MfaCodeDto {
  @ApiProperty({ example: '123456' })
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: 'eyJ...', required: false })
  @IsOptional()
  @IsString()
  mfaToken?: string;
}
