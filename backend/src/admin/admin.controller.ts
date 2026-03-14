import { Controller, Get, UseGuards, Patch, Param, Body, Post } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('overview')
  getOverview() {
    return this.adminService.getOverview();
  }

  @Get('reports')
  getReports() {
    return this.adminService.getReports();
  }

  @Patch('reports/:id/status')
  updateReportStatus(
    @Param('id') id: string,
    @Body('status') status: 'VERIFIED' | 'REMOVED' | 'PUBLISHED' | 'UNDER_REVIEW',
  ) {
    return this.adminService.updateReportStatus(+id, status);
  }

  @Get('users')
  getUsers() {
    return this.adminService.getUsers();
  }

  @Patch('users/:id/role')
  updateUserRole(@Param('id') id: string, @Body('role') role: 'USER' | 'ADMIN' | 'SUPER_ADMIN') {
    return this.adminService.updateUserRole(+id, role);
  }

  @Get('locations')
  getLocations() {
    return this.adminService.getLocations();
  }

  @Post('locations/cities')
  createCity(@Body('name') name: string, @Body('countryId') countryId: number) {
    return this.adminService.createCity(name, countryId);
  }

  @Post('locations/areas')
  createArea(@Body('name') name: string, @Body('cityId') cityId: number) {
    return this.adminService.createArea(name, cityId);
  }
}
