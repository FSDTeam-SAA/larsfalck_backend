import {
  IsArray, IsEnum, IsMongoId, IsNotEmpty,
  IsOptional, IsString,
} from 'class-validator';
import { Transform } from 'class-transformer';

const toArray = ({ value }: { value: any }) =>
  Array.isArray(value)
    ? value
    : String(value).split(',').map((v) => v.trim()).filter(Boolean);

export class CreatePlaylistDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  @Transform(toArray)
  songs?: string[];

  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: string;
}

export class UpdatePlaylistDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  @Transform(toArray)
  songs?: string[];

  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: string;
}

export class AddRemoveSongsDto {
  @IsArray()
  @IsMongoId({ each: true })
  @Transform(toArray)
  songs: string[];
}

export class GetPlaylistsQueryDto {
  @IsOptional() @IsString() page?:   string;
  @IsOptional() @IsString() limit?:  string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() date?:   string;

  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: string;
}

export class ReorderSongsDto {
  @IsArray()
  @IsMongoId({ each: true })
  songIds: string[];
}