import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { GenreService } from './genre.service';
import { CreateGenreDto, UpdateGenreDto, GetGenresQueryDto } from './dto/genre.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard }   from '../../common/guards/roles.guard';
import { Roles }        from '../../common/decorators/roles.decorator';
import { Public }       from '../../common/decorators/public.decorator';
import { RoleType }     from '../../common/enums/role.enum';


@Controller('genre')
@UseGuards(JwtAuthGuard)
export class GenreController {
  constructor(private readonly genreService: GenreService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(RoleType.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateGenreDto) {
    return this.genreService.create(dto);
  }

  @Public()
  @Get()
  findAll(@Query() query: GetGenresQueryDto) {
    return this.genreService.findAll(query);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.genreService.findOne(id);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(RoleType.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateGenreDto) {
    return this.genreService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(RoleType.ADMIN)
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string) {
    return this.genreService.remove(id);
  }
}