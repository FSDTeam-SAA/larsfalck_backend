import {
  IsArray, IsDateString, IsEnum, IsMongoId,
  IsNotEmpty, IsOptional, IsString,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateAlbumDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  // From multipart form: can arrive as a comma-separated string or an array
  @IsArray()
  @IsMongoId({ each: true })
  @Transform(({ value }) =>
    Array.isArray(value) ? value : String(value).split(',').map((v) => v.trim()),
  )
  artists: string[];

  @IsOptional()
  @IsDateString()
  releaseDate?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: string;
}

export class UpdateAlbumDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  @Transform(({ value }) =>
    Array.isArray(value) ? value : String(value).split(',').map((v) => v.trim()),
  )
  artists?: string[];

  @IsOptional()
  @IsDateString()
  releaseDate?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: string;
}

export class GetAlbumsQueryDto {
  @IsOptional() @IsString() page?:     string;
  @IsOptional() @IsString() limit?:    string;
  @IsOptional() @IsString() search?:   string;
  @IsOptional() @IsString() date?:     string;
  @IsOptional() @IsMongoId() artist?:  string;

  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: string;
}

export class ReorderSongsDto {
  @IsArray()
  @IsMongoId({ each: true })
  songIds: string[];
}