import {
  Controller, Get, Post, Query, UseGuards,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { HomeService } from './home.service';
import { JwtAuthGuard }  from '../../common/guards/jwt-auth.guard';
import { RolesGuard }    from '../../common/guards/roles.guard';
import { Roles }         from '../../common/decorators/roles.decorator';
import { Public }        from '../../common/decorators/public.decorator';
import { CurrentUser }   from '../../common/decorators/current-user.decorator';
import { RoleType }      from '../../common/enums/role.enum';

@Controller('home')
@UseGuards(JwtAuthGuard)
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  // ─── Main endpoint — all sections in one call ─────────────────────────────
  // Public users see popular sections
  // Logged-in users also get personalized recommendations

  @Public()
  @Get('sections')
  getSections(@CurrentUser('_id') userId?: string) {
    return this.homeService.getSections(userId);
  }

  // ─── Individual sections ──────────────────────────────────────────────────

  @Public()
  @Get('popular-songs')
  getPopularSongs(@Query('limit') limit?: string) {
    return this.homeService.getPopularSongs(limit ? Number(limit) : 20);
  }

  @Public()
  @Get('popular-artists')
  getPopularArtists(@Query('limit') limit?: string) {
    return this.homeService.getPopularArtists(limit ? Number(limit) : 10);
  }

  @Public()
  @Get('popular-albums')
  getPopularAlbums(@Query('limit') limit?: string) {
    return this.homeService.getPopularAlbums(limit ? Number(limit) : 10);
  }

  @Get('recommended')
  async getRecommended(
    @CurrentUser('_id') userId: string,
    @Query('limit') limit?: string,
  ): Promise<any> {
    return this.homeService.getRecommended(userId, limit ? Number(limit) : 20);
  }

  // ─── Admin only ───────────────────────────────────────────────────────────

  @Post('recompute')
  @UseGuards(RolesGuard)
  @Roles(RoleType.ADMIN)
  @HttpCode(HttpStatus.OK)
  triggerRecompute() {
    return this.homeService.triggerRecompute();
  }

  @Get('cache-info')
  @UseGuards(RolesGuard)
  @Roles(RoleType.ADMIN)
  getCacheInfo() {
    return this.homeService.getCacheInfo();
  }
}