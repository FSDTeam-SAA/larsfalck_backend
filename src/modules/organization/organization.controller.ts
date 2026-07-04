import {
  Controller, Get, Post, Delete,
  Body, Param, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard }   from '../../common/guards/roles.guard';
import { Roles }        from '../../common/decorators/roles.decorator';
import { Public }       from '../../common/decorators/public.decorator';
import { CurrentUser }  from '../../common/decorators/current-user.decorator';
import { RoleType }     from '../../common/enums/role.enum';
import {
  IsArray, IsEmail, IsMongoId, IsNotEmpty,
  IsNumber, IsOptional, IsString, Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

class OrgCheckoutDto {
  @IsMongoId()  planId:       string;
  @IsString()   @IsNotEmpty() businessName: string;
  @IsNumber()   @Min(1)
  @Transform(({ value }) => Number(value))
  seats: number;
}

class JoinOrgDto {
  @IsString()   @IsNotEmpty() orgCode:  string;
  @IsString()   @IsNotEmpty() name:     string;
  @IsEmail()                  email:    string;
  @IsString()   @IsNotEmpty() password: string;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  preferredGenres?: string[];
}

class RemoveWorkerDto {
  @IsMongoId() workerId: string;
}

@Controller('organization')
@UseGuards(JwtAuthGuard)
export class OrganizationController {
  constructor(private readonly orgService: OrganizationService) {}

  // ─── Owner buys org subscription ─────────────────────────────────────────
  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  createOrgCheckout(
    @CurrentUser('_id') userId: string,
    @Body() dto: OrgCheckoutDto,
  ) {
    return this.orgService.createOrgCheckout(userId, dto);
  }

  // ─── Worker joins org via code — public route ─────────────────────────────
  @Public()
  @Post('join')
  @HttpCode(HttpStatus.CREATED)
  joinOrganization(@Body() dto: JoinOrgDto) {
    return this.orgService.joinOrganization(dto);
  }

  // ─── Owner views their org + workers ─────────────────────────────────────
  @Get('my')
  getMyOrg(@CurrentUser('_id') userId: string) {
    return this.orgService.getMyOrg(userId);
  }

  // ─── Owner removes a worker ───────────────────────────────────────────────
  @Delete('worker/:workerId')
  @HttpCode(HttpStatus.OK)
  removeWorker(
    @CurrentUser('_id') ownerId:  string,
    @Param('workerId')  workerId: string,
  ) {
    return this.orgService.removeWorker(ownerId, workerId);
  }

  // ─── Admin: all organizations ─────────────────────────────────────────────
  @Get('all')
  @UseGuards(RolesGuard)
  @Roles(RoleType.ADMIN)
  getAllOrgs(@Query() query: { page?: string; limit?: string; search?: string }) {
    return this.orgService.getAllOrgs(query);
  }
}