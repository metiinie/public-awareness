import { Controller, Get, UseGuards, Patch, Param, Body, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';


import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')

export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  getOverview() {
    return this.adminService.getOverview();
  }

  @Post('reports/:id/verify')
  verifyReport(@Param('id') id: string, @Req() req: any) {
    return this.adminService.updateReportStatus(+id, 'VERIFIED', req.user.userId);
  }

  @Post('reports/:id/remove')
  removeReport(@Param('id') id: string, @Req() req: any) {
    return this.adminService.updateReportStatus(+id, 'REMOVED', req.user.userId);
  }

  @Get('reports/critical')
  getCriticalReports() {
    return this.adminService.getCriticalReports();
  }

  @Get('reports/flagged')
  getFlaggedReports() {
    return this.adminService.getFlaggedReports();
  }

  @Get('reports')
  getReports(@Query() query: any) {
    return this.adminService.getReports({
      cityId: query.cityId ? +query.cityId : undefined,
      areaId: query.areaId ? +query.areaId : undefined,
      categoryId: query.categoryId ? +query.categoryId : undefined,
      urgency: query.urgency,
      status: query.status,
      minTrust: query.minTrust ? +query.minTrust : undefined,
    });
  }

  @Post('reports/:id/archive')
  archiveReport(@Param('id') id: string, @Req() req: any) {
    return this.adminService.archiveReport(+id, req.user.userId);
  }

  @Post('reports/:id/merge')
  mergeReports(@Param('id') id: string, @Body('duplicateId') duplicateId: number, @Req() req: any) {
    return this.adminService.mergeReports(+id, duplicateId, req.user.userId);
  }

  @Patch('reports/:id/status')
  updateReportStatus(
    @Param('id') id: string,
    @Body('status') status: 'VERIFIED' | 'REMOVED' | 'REPORTED' | 'UNDER_REVIEW' | 'RESOLVED' | 'ARCHIVED',
    @Req() req: any
  ) {
    return this.adminService.updateReportStatus(+id, status, req.user.userId);
  }


  @Get('users')
  getUsers() {
    return this.adminService.getUsers();
  }

  @Patch('users/:id/role')
  updateUserRole(@Param('id') id: string, @Body('role') role: 'USER' | 'ADMIN' | 'SUPER_ADMIN', @Req() req: any) {
    return this.adminService.updateUserRole(+id, role, req.user.userId);
  }

  @Post('users/:id/warn')
  warnUser(@Param('id') id: string, @Body('reason') reason: string, @Req() req: any) {
    return this.adminService.warnUser(+id, reason, req.user.userId);
  }

  @Post('users/:id/suspend')
  suspendUser(@Param('id') id: string, @Body('days') days: number, @Body('reason') reason: string, @Req() req: any) {
    return this.adminService.suspendUser(+id, days, reason, req.user.userId);
  }

  @Post('users/:id/ban')
  banUser(@Param('id') id: string, @Body('reason') reason: string, @Req() req: any) {
    return this.adminService.banUser(+id, reason, req.user.userId);
  }

  @Post('users/:id/reset-trust')
  resetTrustScore(@Param('id') id: string, @Req() req: any) {
    return this.adminService.resetTrustScore(+id, req.user.userId);
  }


  @Get('locations')

  getLocations() {
    return this.adminService.getLocations();
  }

  @Post('locations/cities')
  createCity(@Body('name') name: string, @Body('countryId') countryId: number, @Req() req: any) {
    return this.adminService.createCity(name, countryId, req.user.userId);
  }

  @Post('locations/areas')
  createArea(@Body('name') name: string, @Body('cityId') cityId: number, @Req() req: any) {
    return this.adminService.createArea(name, cityId, req.user.userId);
  }

  @Get('categories')
  getCategories() {
    return this.adminService.getCategories();
  }

  @Post('categories')
  createCategory(@Body('name') name: string, @Req() req: any, @Body('icon') icon?: string) {
    return this.adminService.createCategory(name, req.user.userId, icon);
  }

  @Patch('categories/:id')
  updateCategory(@Param('id') id: string, @Body() data: any, @Req() req: any) {
    return this.adminService.updateCategory(+id, data, req.user.userId);
  }

  @Post('broadcast')
  sendBroadcast(@Body('message') message: string, @Req() req: any, @Body('areaId') areaId?: number) {
    return this.adminService.sendBroadcast(message, req.user.userId, areaId);
  }


  @Get('audit-logs')
  getAuditLogs() {
    return this.adminService.getAuditLogs();
  }
}

