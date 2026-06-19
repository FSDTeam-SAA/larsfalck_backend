import {
  IsArray, IsEnum, IsNotEmpty, IsNumber,
  IsOptional, IsString, Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreatePlanDto {
  @IsString() @IsNotEmpty()
  name: string;

  @IsNumber() @Min(0)
  @Transform(({ value }) => Number(value))
  price: number;

  @IsEnum(['monthly', 'yearly'])
  billingCycle: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: string;
}

export class UpdatePlanDto {
  @IsOptional() @IsString() @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsNumber() @Min(0)
  @Transform(({ value }) => Number(value))
  price?: number;

  @IsOptional() @IsEnum(['monthly', 'yearly'])
  billingCycle?: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  features?: string[];

  @IsOptional() @IsEnum(['active', 'inactive'])
  status?: string;
}

export class GetPlansQueryDto {
  @IsOptional() @IsString() page?:         string;
  @IsOptional() @IsString() limit?:        string;
  @IsOptional() @IsString() search?:       string;
  @IsOptional() @IsString() date?:         string;
  @IsOptional() @IsEnum(['monthly', 'yearly'])  billingCycle?: string;
  @IsOptional() @IsEnum(['active', 'inactive']) status?:       string;
}