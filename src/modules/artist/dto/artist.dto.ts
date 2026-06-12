import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateArtistDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: string;
}

export class UpdateArtistDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: string;
}

export class GetArtistsQueryDto {
  @IsOptional() @IsString() page?:   string;
  @IsOptional() @IsString() limit?:  string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() date?:   string;

  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: string;
}