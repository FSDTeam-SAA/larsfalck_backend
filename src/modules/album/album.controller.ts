import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, UseGuards, UseInterceptors,
  UploadedFiles, HttpCode, HttpStatus, BadRequestException,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { AlbumService } from './album.service';
import { CreateAlbumDto, UpdateAlbumDto, GetAlbumsQueryDto } from './dto/album.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard }   from '../../common/guards/roles.guard';
import { Roles }        from '../../common/decorators/roles.decorator';
import { Public }       from '../../common/decorators/public.decorator';
import { RoleType }     from '../../common/enums/role.enum';
import { createDiskStorage } from '../../common/utils/multer.util';

const imageStorage = createDiskStorage('images');

@Controller('album')
@UseGuards(JwtAuthGuard)
export class AlbumController {
  constructor(private readonly albumService: AlbumService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(RoleType.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'coverImage', maxCount: 1 }], { storage: imageStorage }),
  )
  create(
    @Body() dto: CreateAlbumDto,
    @UploadedFiles() files: { coverImage?: Express.Multer.File[] },
  ) {
    return this.albumService.create(dto, files as any);
  }

  @Public()
  @Get()
  findAll(@Query() query: GetAlbumsQueryDto) {
    return this.albumService.findAll(query);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.albumService.findOne(id);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(RoleType.ADMIN)
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'coverImage', maxCount: 1 }], { storage: imageStorage }),
  )
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAlbumDto,
    @UploadedFiles() files: { coverImage?: Express.Multer.File[] },
  ) {
    return this.albumService.update(id, dto, files as any);
  }

  @Put(':id/cover-image')
  @UseGuards(RolesGuard)
  @Roles(RoleType.ADMIN)
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'coverImage', maxCount: 1 }], { storage: imageStorage }),
  )
  updateCoverImage(
    @Param('id') id: string,
    @UploadedFiles() files: { coverImage?: Express.Multer.File[] },
  ) {
    if (!files?.coverImage?.length) throw new BadRequestException('Cover image is required');
    return this.albumService.updateCoverImage(id, files as any);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(RoleType.ADMIN)
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string) {
    return this.albumService.remove(id);
  }
}