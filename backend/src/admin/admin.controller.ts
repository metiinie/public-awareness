import { Controller, Get, UseGuards, Patch, Param, Body, Post, Query, Req, Header } from '@nestjs/common';
import { Request } from 'express';


import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('system-status')
  @Roles('SUPER_ADMIN')
  getSystemStatus() {
    return this.adminService.getSystemStatus();
  }

  @Post('emergency-mode')
  @Roles('SUPER_ADMIN')
  toggleEmergencyMode(@Body() body: { enabled: boolean; reason: string }, @Req() req: any) {
    return this.adminService.logAction(req.user.userId, 'EMERGENCY_MODE_TOGGLE', body.reason, body.enabled ? 1 : 0);
  }

  private getScope(user: any): { cityId?: number; areaId?: number } | undefined {
    if (user.role === 'SUPER_ADMIN') return undefined; // Global access
    return {
      cityId: user.cityId,
      areaId: user.areaId,
    };
  }

  @Get('stats')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  getOverview(@Req() req: any) {
    return this.adminService.getOverview(this.getScope(req.user));
  }

  @Post('reports/:id/verify')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  verifyReport(@Param('id') id: string, @Body('reason') reason: string, @Req() req: any) {
    return this.adminService.updateReportStatus(+id, 'VERIFIED', req.user.userId, reason);
  }

  @Post('reports/:id/remove')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  removeReport(@Param('id') id: string, @Body('reason') reason: string, @Req() req: any) {
    return this.adminService.updateReportStatus(+id, 'REMOVED', req.user.userId, reason);
  }

  @Get('reports/critical')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  getCriticalReports(@Req() req: any) {
    return this.adminService.getCriticalReports(this.getScope(req));
  }

  @Get('reports/flagged')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  getFlaggedReports(@Req() req: any) {
    return this.adminService.getFlaggedReports(this.getScope(req));
  }

  @Get('reports')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  getReports(@Query() query: any, @Req() req: any) {
    return this.adminService.getReports({
      cityId: query.cityId ? +query.cityId : undefined,
      areaId: query.areaId ? +query.areaId : undefined,
      categoryId: query.categoryId ? +query.categoryId : undefined,
      urgency: query.urgency,
      status: query.status,
      minConfidence: query.minConfidence ? +query.minConfidence : undefined,
      maxConfidence: query.maxConfidence ? +query.maxConfidence : undefined,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      id: query.id ? +query.id : undefined,
    }, this.getScope(req));
  }

  @Get('reports/export')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="reports_export.csv"')
  @Roles('SUPER_ADMIN')
  exportReports(@Query() query: any, @Req() req: any) {
    return this.adminService.exportReports({
      cityId: query.cityId ? +query.cityId : undefined,
      areaId: query.areaId ? +query.areaId : undefined,
      categoryId: query.categoryId ? +query.categoryId : undefined,
      urgency: query.urgency,
      status: query.status,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
    }, this.getScope(req));
  }

  @Post('reports/:id/archive')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  archiveReport(@Param('id') id: string, @Body('reason') reason: string, @Req() req: any) {
    return this.adminService.archiveReport(+id, req.user.userId, reason);
  }

  @Post('reports/:id/merge')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  mergeReports(@Param('id') id: string, @Body('mergedIds') mergedIds: number[], @Body('reason') reason: string, @Req() req: any) {
    return this.adminService.mergeReports(+id, mergedIds, req.user.userId, reason);
  }

  @Post('reports/bulk-status')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  bulkUpdateStatus(@Body() body: { ids: number[], status: any, reason: string }, @Req() req: any) {
    return this.adminService.bulkUpdateStatus(body.ids, body.status, req.user.userId, body.reason);
  }

  @Post('reports/:id/restore')
  @Roles('SUPER_ADMIN')
  restoreReport(@Param('id') id: string, @Body('reason') reason: string, @Req() req: any) {
    return this.adminService.restoreReport(+id, req.user.userId, reason);
  }

  @Get('reports/:id/history')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  getReportHistory(@Param('id') id: string) {
    return this.adminService.getReportHistory(+id);
  }


  @Get('users')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  getUsers(@Req() req: any) {
    return this.adminService.getUsers(this.getScope(req));
  }

  @Patch('users/:id/role')
  @Roles('SUPER_ADMIN')
  updateUserRole(@Param('id') id: string, @Body('role') role: 'USER' | 'ADMIN' | 'SUPER_ADMIN', @Req() req: any) {
    return this.adminService.updateUserRole(+id, role, req.user.userId);
  }

  @Post('users/:id/warn')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  warnUser(@Param('id') id: string, @Body('reason') reason: string, @Req() req: any) {
    return this.adminService.warnUser(+id, reason, req.user.userId);
  }

  @Post('users/:id/suspend')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  suspendUser(@Param('id') id: string, @Body('days') days: number, @Body('reason') reason: string, @Req() req: any) {
    return this.adminService.suspendUser(+id, days, reason, req.user.userId);
  }

  @Post('users/:id/ban')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  banUser(@Param('id') id: string, @Body('reason') reason: string, @Req() req: any) {
    return this.adminService.banUser(+id, reason, req.user.userId);
  }

  @Post('users/:id/reset-trust')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  resetTrustScore(@Param('id') id: string, @Req() req: any) {
    return this.adminService.resetTrustScore(+id, req.user.userId);
  }

  @Get('locations')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  getLocations() {
    return this.adminService.getLocations();
  }

  @Post('locations/cities')
  @Roles('SUPER_ADMIN')
  createCity(@Body('name') name: string, @Body('countryId') countryId: number, @Req() req: any) {
    return this.adminService.createCity(name, countryId, req.user.userId);
  }

  @Post('locations/areas')
  @Roles('SUPER_ADMIN')
  createArea(@Body('name') name: string, @Body('cityId') cityId: number, @Req() req: any) {
    return this.adminService.createArea(name, cityId, req.user.userId);
  }

  @Get('categories')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  getCategories() {
    return this.adminService.getCategories();
  }

  @Post('categories')
  @Roles('SUPER_ADMIN')
  createCategory(@Body('name') name: string, @Req() req: any, @Body('icon') icon?: string) {
    return this.adminService.createCategory(name, req.user.userId, icon);
  }

  @Patch('categories/:id')
  @Roles('SUPER_ADMIN')
  updateCategory(@Param('id') id: string, @Body() data: any, @Req() req: any) {
    return this.adminService.updateCategory(+id, data, req.user.userId);
  }

  @Post('broadcast')
  @Roles('SUPER_ADMIN')
  sendBroadcast(@Body('message') message: string, @Req() req: any, @Body('areaId') areaId?: number) {
    return this.adminService.sendBroadcast(message, req.user.userId, areaId);
  }


  @Get('audit-logs')
  @Roles('SUPER_ADMIN')
  getAuditLogs() {
    return this.adminService.getAuditLogs();
  }
}

