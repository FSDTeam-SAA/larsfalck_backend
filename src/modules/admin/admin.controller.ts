import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard }   from '../../common/guards/roles.guard';
import { Roles }        from '../../common/decorators/roles.decorator';
import { RoleType }     from '../../common/enums/role.enum';
import { IsEnum, IsNumberString, IsOptional, IsString } from 'class-validator';

class RevenueQueryDto {
  @IsOptional() @IsNumberString() year?: string;
}

class ActivityQueryDto {
  @IsOptional() @IsString()                          page?:   string;
  @IsOptional() @IsString()                          limit?:  string;
  @IsOptional() @IsString()                          search?: string;
  @IsOptional() @IsString()                          date?:   string;
  @IsOptional() @IsEnum(['user', 'song'])             filter?: string;
}

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleType.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  getDashboard() {
    return this.adminService.getDashboard();
  }

  @Get('revenue')
  getRevenueChart(@Query() query: RevenueQueryDto) {
    return this.adminService.getRevenueChart(
      query.year ? Number(query.year) : undefined,
    );
  }

  @Get('activity')
  getActivity(@Query() query: ActivityQueryDto) {
    return this.adminService.getActivity(query);
  }
}