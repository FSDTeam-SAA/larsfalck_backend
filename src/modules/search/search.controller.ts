import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SearchService } from './search.service';
import { IsNumberString, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public }       from '../../common/decorators/public.decorator';

class SearchQueryDto {
  @IsString() q: string;
  @IsOptional() @IsNumberString() limit?:  string;
  @IsOptional() @IsNumberString() page?:   string;
}

@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  // ─── Global search — all types in one call ────────────────────────────────
  @Public()
  @Get()
  globalSearch(
    @Query('q')     q:      string,
    @Query('limit') limit?: string,
  ) {
    return this.searchService.globalSearch(q, limit ? Number(limit) : 5);
  }

  // ─── Individual type searches — with pagination ───────────────────────────
  @Public()
  @Get('songs')
  searchSongs(
    @Query('q')     q:      string,
    @Query('page')  page?:  string,
    @Query('limit') limit?: string,
  ) {
    return this.searchService.searchSongs(q, Number(page || 1), Number(limit || 10));
  }

  @Public()
  @Get('artists')
  searchArtists(
    @Query('q')     q:      string,
    @Query('page')  page?:  string,
    @Query('limit') limit?: string,
  ) {
    return this.searchService.searchArtists(q, Number(page || 1), Number(limit || 10));
  }

  @Public()
  @Get('albums')
  searchAlbums(
    @Query('q')     q:      string,
    @Query('page')  page?:  string,
    @Query('limit') limit?: string,
  ) {
    return this.searchService.searchAlbums(q, Number(page || 1), Number(limit || 10));
  }

  @Public()
  @Get('playlists')
  searchPlaylists(
    @Query('q')     q:      string,
    @Query('page')  page?:  string,
    @Query('limit') limit?: string,
  ) {
    return this.searchService.searchPlaylists(q, Number(page || 1), Number(limit || 10));
  }

    @Public()
    @Get('tags')
    searchByTags(
    @Query('tags')  tags:   string,
    @Query('page')  page?:  string,
    @Query('limit') limit?: string,
    ) {
    const tagArray = tags
        ? tags.split(',').map((t) => t.trim()).filter(Boolean)
        : [];
    return this.searchService.searchByTags(tagArray, Number(page || 1), Number(limit || 10));
    }
}