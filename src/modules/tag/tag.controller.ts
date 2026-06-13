import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { TagService } from './tag.service';
import { CreateTagDto, UpdateTagDto, GetTagsQueryDto } from './dto/tag.dto';
import { IsArray, IsString } from 'class-validator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard }   from '../../common/guards/roles.guard';
import { Roles }        from '../../common/decorators/roles.decorator';
import { Public }       from '../../common/decorators/public.decorator';
import { RoleType }     from '../../common/enums/role.enum';

class BulkCreateTagDto {
  @IsArray()
  @IsString({ each: true })
  names: string[];
}


@Controller('tag')
@UseGuards(JwtAuthGuard)
export class TagController {
  constructor(private readonly tagService: TagService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(RoleType.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateTagDto) {
    return this.tagService.create(dto);
  }

  // Bulk create — seed all client keywords in one shot
  @Post('bulk')
  @UseGuards(RolesGuard)
  @Roles(RoleType.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  createBulk(@Body() dto: BulkCreateTagDto) {
    return this.tagService.createBulk(dto.names);
  }

  @Public()
  @Get()
  findAll(@Query() query: GetTagsQueryDto) {
    return this.tagService.findAll(query);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tagService.findOne(id);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(RoleType.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateTagDto) {
    return this.tagService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(RoleType.ADMIN)
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string) {
    return this.tagService.remove(id);
  }
}