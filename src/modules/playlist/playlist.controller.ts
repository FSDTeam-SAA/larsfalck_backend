import {
  Controller, Get, Post, Put, Delete, Patch,
  Body, Param, Query, UseGuards, UseInterceptors,
  UploadedFiles, HttpCode, HttpStatus,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { PlaylistService } from './playlist.service';
import {
  CreatePlaylistDto, UpdatePlaylistDto,
  AddRemoveSongsDto, GetPlaylistsQueryDto,
  ReorderSongsDto,
} from './dto/playlist.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard }   from '../../common/guards/roles.guard';
import { Roles }        from '../../common/decorators/roles.decorator';
import { Public }       from '../../common/decorators/public.decorator';
import { CurrentUser }  from '../../common/decorators/current-user.decorator';
import { RoleType }     from '../../common/enums/role.enum';
import { createDiskStorage } from '../../common/utils/multer.util';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';

const imageStorage = createDiskStorage('images');


@Controller('playlist')
@UseGuards(JwtAuthGuard)
export class PlaylistController {
  constructor(private readonly playlistService: PlaylistService) {}

  // ══════════════════════════════════════════════════
  // ADMIN ROUTES
  // ══════════════════════════════════════════════════

  @Post('admin')
  @UseGuards(RolesGuard)
  @Roles(RoleType.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'coverImage', maxCount: 1 }], { storage: imageStorage }),
  )
  adminCreate(
    @CurrentUser('_id') userId: string,
    @Body() dto: CreatePlaylistDto,
    @UploadedFiles() files: { coverImage?: Express.Multer.File[] },
  ) {
    return this.playlistService.adminCreate(userId, dto, files as any);
  }

  @Get('admin/all')
  @UseGuards(RolesGuard)
  @Roles(RoleType.ADMIN)
  adminFindAll(@Query() query: GetPlaylistsQueryDto) {
    return this.playlistService.adminFindAll(query);
  }

  // ══════════════════════════════════════════════════
  // PUBLIC ROUTES (website listing — admin playlists)
  // ══════════════════════════════════════════════════

  @Public()
  @Get('public')
  findPublic(@Query() query: GetPlaylistsQueryDto) {
    return this.playlistService.findPublic(query);
  }

  // ══════════════════════════════════════════════════
  // USER ROUTES (own playlists)
  // ══════════════════════════════════════════════════

  @Post('my')
  @UseGuards(JwtAuthGuard, SubscriptionGuard)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'coverImage', maxCount: 1 }], { storage: imageStorage }),
  )
  userCreate(
    @CurrentUser('_id') userId: string,
    @Body() dto: CreatePlaylistDto,
    @UploadedFiles() files: { coverImage?: Express.Multer.File[] },
  ) {
    return this.playlistService.userCreate(userId, dto, files as any);
  }

  @Get('my')
  @UseGuards(JwtAuthGuard, SubscriptionGuard) 
  userFindAll(
    @CurrentUser('_id') userId: string,
    @Query() query: GetPlaylistsQueryDto,
  ) {
    return this.playlistService.userFindAll(userId, query);
  }

  // ══════════════════════════════════════════════════
  // SHARED ROUTES (admin sees all, user sees own/public)
  // ══════════════════════════════════════════════════

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser('_id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.playlistService.findOne(id, userId, role === RoleType.ADMIN || role === RoleType.USER);
  }

  @Put(':id')
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'coverImage', maxCount: 1 }], { storage: imageStorage }),
  )
  update(
    @Param('id') id: string,
    @CurrentUser('_id') userId: string,
    @CurrentUser('role') role: string,
    @Body() dto: UpdatePlaylistDto,
    @UploadedFiles() files: { coverImage?: Express.Multer.File[] },
  ) {
    return this.playlistService.update(id, userId, role === RoleType.ADMIN || role === RoleType.USER, dto, files as any);
  }

  @Put(':id/reorder')
  reorderSongs(
    @Param('id') id: string,
    @CurrentUser('_id') userId: string,
    @CurrentUser('role') role:  string,
    @Body() dto: ReorderSongsDto,
  ) {
    return this.playlistService.reorderSongs(
      id, userId, role === RoleType.ADMIN, dto.songIds,
    );
  }

  @Patch(':id/songs/add')
  @UseGuards(JwtAuthGuard, SubscriptionGuard)  
  addSongs(
    @Param('id') id: string,
    @CurrentUser('_id') userId: string,
    @CurrentUser('role') role: string,
    @Body() dto: AddRemoveSongsDto,
  ) {
    return this.playlistService.addSongs(id, userId, role === RoleType.ADMIN || role === RoleType.USER, dto);
  }

  @Patch(':id/songs/remove')
  @UseGuards(JwtAuthGuard, SubscriptionGuard) 
  removeSongs(
    @Param('id') id: string,
    @CurrentUser('_id') userId: string,
    @CurrentUser('role') role: string,
    @Body() dto: AddRemoveSongsDto,
  ) {
    return this.playlistService.removeSongs(id, userId, role === RoleType.ADMIN || role === RoleType.USER, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(
    @Param('id') id: string,
    @CurrentUser('_id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.playlistService.remove(id, userId, role === RoleType.ADMIN || role === RoleType.USER);
  }
}