import {
  Controller, Get, Post, Query, UseGuards,
  HttpCode, HttpStatus, Req,
} from '@nestjs/common';
import { HomeService } from './home.service';
import { JwtAuthGuard }  from '../../common/guards/jwt-auth.guard';
import { RolesGuard }    from '../../common/guards/roles.guard';
import { Roles }         from '../../common/decorators/roles.decorator';
import { Public }        from '../../common/decorators/public.decorator';
import { CurrentUser }   from '../../common/decorators/current-user.decorator';
import { RoleType }      from '../../common/enums/role.enum';
import { ConfigService } from '@nestjs/config';
import { JwtService }    from '@nestjs/jwt';

@Controller('home')
@UseGuards(JwtAuthGuard)
export class HomeController {
  constructor(
    private readonly homeService:    HomeService,
    private readonly jwtService:     JwtService,
    private readonly configService:  ConfigService,
  ) {}

  // extract userId from token manually — route is @Public so guard won't set req.user
  private extractUserId(req: any): string | undefined {
    try {
      const authHeader = req.headers?.authorization;
      if (!authHeader?.startsWith('Bearer ')) return undefined;
      const token   = authHeader.split(' ')[1];
      const decoded = this.jwtService.verify(token, {
        secret: this.configService.get<string>('auth.accessTokenSecret'),
      });
      return decoded?._id;
    } catch {
      return undefined;
    }
  }

  @Public()
  @Get('sections')
  getSections(@Req() req: any) {
    const userId = this.extractUserId(req);
    return this.homeService.getSections(userId);
  }

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