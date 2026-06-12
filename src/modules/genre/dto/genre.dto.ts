import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateGenreDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: string;
}

export class UpdateGenreDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: string;
}

export class GetGenresQueryDto {
  @IsOptional() @IsString() page?:   string;
  @IsOptional() @IsString() limit?:  string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() date?:   string;

  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: string;
}