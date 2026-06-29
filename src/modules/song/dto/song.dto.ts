import {
  IsArray, IsEnum, IsMongoId, IsNotEmpty,
  IsNumber, IsOptional, IsString, Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

// helper: accepts comma-separated string or array from form-data
const toArray = ({ value }: { value: any }) =>
  Array.isArray(value)
    ? value
    : String(value)
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);

export class CreateSongDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  @Transform(toArray)
  artists?: string[];

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  @Transform(toArray)
  albums?: string[];

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  @Transform(toArray)
  genres?: string[];

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  @Transform(toArray)
  tags?: string[];

  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: string;
}

export class UpdateSongDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  @Transform(toArray)
  artists?: string[];

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  @Transform(toArray)
  albums?: string[];

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  @Transform(toArray)
  genres?: string[];

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  @Transform(toArray)
  tags?: string[];

  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: string;
}

export class GetSongsQueryDto {
  @IsOptional() @IsString() page?:   string;
  @IsOptional() @IsString() limit?:  string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() date?:   string;

  @IsOptional() @IsMongoId() artist?: string;
  @IsOptional() @IsMongoId() album?:  string;
  @IsOptional() @IsMongoId() genre?:  string;
  @IsOptional() @IsMongoId() tag?:    string;

  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: string;
}

// For bulk upload — shared metadata applied to all songs
export class BulkUploadSongDto {
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  @Transform(toArray)
  artists?: string[];

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  @Transform(toArray)
  albums?: string[];

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  @Transform(toArray)
  genres?: string[];

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  @Transform(toArray)
  tags?: string[];

  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: string;
}


export class BulkUpdateSongDto {
  @IsArray()
  @IsMongoId({ each: true })
  @Transform(toArray)
  songIds: string[];

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  @Transform(toArray)
  artists?: string[];

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  @Transform(toArray)
  albums?: string[];

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  @Transform(toArray)
  genres?: string[];

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  @Transform(toArray)
  tags?: string[];

  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: string;
}
