import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, UseGuards, UseInterceptors,
  UploadedFiles, HttpCode, HttpStatus, BadRequestException,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ArtistService } from './artist.service';
import { CreateArtistDto, UpdateArtistDto, GetArtistsQueryDto } from './dto/artist.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard }   from '../../common/guards/roles.guard';
import { Roles }        from '../../common/decorators/roles.decorator';
import { Public }       from '../../common/decorators/public.decorator';
import { RoleType }     from '../../common/enums/role.enum';
import { createDiskStorage } from '../../common/utils/multer.util';

const imageStorage = createDiskStorage('images');

@Controller('artist')
@UseGuards(JwtAuthGuard)
export class ArtistController {
  constructor(private readonly artistService: ArtistService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(RoleType.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'image', maxCount: 1 }], { storage: imageStorage }),
  )
  create(
    @Body() dto: CreateArtistDto,
    @UploadedFiles() files: { image?: Express.Multer.File[] },
  ) {
    return this.artistService.create(dto, files as any);
  }

  @Public()
  @Get()
  findAll(@Query() query: GetArtistsQueryDto) {
    return this.artistService.findAll(query);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.artistService.findOne(id);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(RoleType.ADMIN)
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'image', maxCount: 1 }], { storage: imageStorage }),
  )
  update(
    @Param('id') id: string,
    @Body() dto: UpdateArtistDto,
    @UploadedFiles() files: { image?: Express.Multer.File[] },
  ) {
    return this.artistService.update(id, dto, files as any);
  }

  @Put(':id/image')
  @UseGuards(RolesGuard)
  @Roles(RoleType.ADMIN)
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'image', maxCount: 1 }], { storage: imageStorage }),
  )
  updateImage(
    @Param('id') id: string,
    @UploadedFiles() files: { image?: Express.Multer.File[] },
  ) {
    if (!files?.image?.length) throw new BadRequestException('Image is required');
    return this.artistService.updateImage(id, files as any);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(RoleType.ADMIN)
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string) {
    return this.artistService.remove(id);
  }

  // place before :id route
  @Public()
  @Get(':id/profile')
  getProfile(@Param('id') id: string) {
    return this.artistService.getProfile(id);
  }
}