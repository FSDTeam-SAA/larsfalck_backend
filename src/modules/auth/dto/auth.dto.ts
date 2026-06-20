import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  IsNumberString,
  Length,
  IsArray,
  IsMongoId,
  IsOptional
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Types } from 'mongoose';

/**
 * Auth DTOs
 * ─────────────────────────────────────────────────────────
 * Replaces the inline DTO interfaces in auth.service.ts.
 * With NestJS + class-validator, these are automatically
 * validated by the global ValidationPipe in main.ts.
 */

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  @Transform(({ value }) =>
    Array.isArray(value) ? value : String(value).split(',').map((v) => v.trim()).filter(Boolean),
  )
  preferredGenres: Types.ObjectId[];
}

export class LoginDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

export class ForgetPasswordDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

export class VerifyCodeDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsNumberString()
  @Length(6, 6)
  otp: string;
}

export class ResetPasswordDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @MinLength(6)
  newPassword: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  oldPassword: string;

  @IsString()
  @MinLength(6)
  newPassword: string;
}


