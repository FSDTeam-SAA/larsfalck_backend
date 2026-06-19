import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { PlanService } from './plan.service';
import { CreatePlanDto, UpdatePlanDto, GetPlansQueryDto } from './dto/plan.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard }   from '../../common/guards/roles.guard';
import { Roles }        from '../../common/decorators/roles.decorator';
import { Public }       from '../../common/decorators/public.decorator';
import { RoleType }     from '../../common/enums/role.enum';

@Controller('plan')
@UseGuards(JwtAuthGuard)
export class PlanController {
  constructor(private readonly planService: PlanService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(RoleType.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreatePlanDto) {
    return this.planService.create(dto);
  }

  @Public()
  @Get()
  findAll(@Query() query: GetPlansQueryDto) {
    return this.planService.findAll(query);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.planService.findOne(id);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(RoleType.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.planService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(RoleType.ADMIN)
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string) {
    return this.planService.remove(id);
  }
}