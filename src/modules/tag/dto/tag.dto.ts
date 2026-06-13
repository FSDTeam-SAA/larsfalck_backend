import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateTagDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: string;
}

export class UpdateTagDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: string;
}

export class GetTagsQueryDto {
  @IsOptional() @IsString() page?:   string;
  @IsOptional() @IsString() limit?:  string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() date?:   string;

  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: string;
}