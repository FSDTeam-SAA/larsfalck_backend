import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, UseGuards, UseInterceptors,
  UploadedFiles, HttpCode, HttpStatus, BadRequestException,
} from '@nestjs/common';
import { FileFieldsInterceptor, FilesInterceptor} from '@nestjs/platform-express';
import { SongService } from './song.service';
import { CreateSongDto, UpdateSongDto, GetSongsQueryDto, BulkUploadSongDto } from './dto/song.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard }   from '../../common/guards/roles.guard';
import { Roles }        from '../../common/decorators/roles.decorator';
import { Public }       from '../../common/decorators/public.decorator';
import { RoleType }     from '../../common/enums/role.enum';
import { createDiskStorage } from '../../common/utils/multer.util';


const mediaStorage = createDiskStorage('files');

@Controller('song')
@UseGuards(JwtAuthGuard)
export class SongController {
  constructor(private readonly songService: SongService) {}

  // ─── Single upload ──────────────────────────────────────────────────────

  @Post()
  @UseGuards(RolesGuard)
  @Roles(RoleType.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'audioFile',  maxCount: 1 },
        { name: 'coverImage', maxCount: 1 },
      ],
      { storage: mediaStorage },
    ),
  )
  create(
    @Body() dto: CreateSongDto,
    @UploadedFiles() files: { audioFile?: Express.Multer.File[]; coverImage?: Express.Multer.File[] },
  ) {
    if (!files?.audioFile?.length) throw new BadRequestException('Audio file is required');
    return this.songService.create(dto, files as any);
  }

  // ─── Bulk upload ────────────────────────────────────────────────────────
  // audioFiles[]: multiple mp3/wav files
  // coverImage:   one shared cover (optional)
  // shared metadata in body (artists, albums, genres, tags)

  @Post('bulk-upload')
  @UseGuards(RolesGuard)
  @Roles(RoleType.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'audioFiles', maxCount: 50 },
        { name: 'coverImage', maxCount: 1  },
      ],
      { storage: mediaStorage },
    ),
  )
  bulkCreate(
    @Body() dto: BulkUploadSongDto,
    @UploadedFiles() files: { audioFiles?: Express.Multer.File[]; coverImage?: Express.Multer.File[] },
  ) {
    if (!files?.audioFiles?.length) throw new BadRequestException('At least one audio file is required');
    return this.songService.bulkCreate(dto, files.audioFiles, files.coverImage?.[0]);
  }

  // ─── Read ────────────────────────────────────────────────────────────────

  @Public()
  @Get()
  findAll(@Query() query: GetSongsQueryDto) {
    return this.songService.findAll(query);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.songService.findOne(id);
  }

  // ─── Update metadata + optional new cover ───────────────────────────────

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(RoleType.ADMIN)
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'coverImage', maxCount: 1 }],
      { storage: mediaStorage },
    ),
  )
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSongDto,
    @UploadedFiles() files: { coverImage?: Express.Multer.File[] },
  ) {
    return this.songService.update(id, dto, files as any);
  }

  // ─── Replace audio file only ─────────────────────────────────────────────

  @Put(':id/audio')
  @UseGuards(RolesGuard)
  @Roles(RoleType.ADMIN)
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'audioFile', maxCount: 1 }],
      { storage: mediaStorage },
    ),
  )
  updateAudioFile(
    @Param('id') id: string,
    @UploadedFiles() files: { audioFile?: Express.Multer.File[] },
  ) {
    if (!files?.audioFile?.length) throw new BadRequestException('Audio file is required');
    return this.songService.updateAudioFile(id, files as any);
  }

  // ─── Replace cover image only ────────────────────────────────────────────

  @Put(':id/cover-image')
  @UseGuards(RolesGuard)
  @Roles(RoleType.ADMIN)
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'coverImage', maxCount: 1 }],
      { storage: mediaStorage },
    ),
  )
  updateCoverImage(
    @Param('id') id: string,
    @UploadedFiles() files: { coverImage?: Express.Multer.File[] },
  ) {
    if (!files?.coverImage?.length) throw new BadRequestException('Cover image is required');
    return this.songService.updateCoverImage(id, files as any);
  }

  // ─── Delete ───────────────────────────────────────────────────────────────

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(RoleType.ADMIN)
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string) {
    return this.songService.remove(id);
  }
}