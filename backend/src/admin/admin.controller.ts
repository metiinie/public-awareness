import { Controller, Get, UseGuards, Patch, Param, Body, Post, Query, Req, Header, Delete } from '@nestjs/common';
import { Request } from 'express';

import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ScopeGuard } from '../auth/guards/scope.guard';
import { AdminRateLimitGuard } from '../auth/guards/admin-rate-limit.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Scoped } from '../auth/decorators/scoped.decorator';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /** Extract the originating IP from the request. */
  private getIp(req: any): string {
    return (
      req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ??
      req.ip ??
      'unknown'
    );
  }

  @Get('system-status')
  @Roles('SUPER_ADMIN')
  getSystemStatus() {
    return this.adminService.getSystemStatus();
  }

  @Post('emergency-mode')
  @Roles('SUPER_ADMIN')
  toggleEmergencyMode(@Body() body: { enabled: boolean; reason: string }, @Req() req: any) {
    return this.adminService.toggleEmergencyMode(body.enabled, req.user.userId, body.reason);
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
  @UseGuards(ScopeGuard)
  @Scoped('REPORT')
  verifyReport(@Param('id') id: string, @Body('reason') reason: string, @Req() req: any) {
    return this.adminService.updateReportStatus(+id, 'VERIFIED', req.user.userId, reason, this.getIp(req));
  }

  @Post('reports/:id/remove')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  @UseGuards(ScopeGuard, AdminRateLimitGuard)
  @Scoped('REPORT')
  removeReport(@Param('id') id: string, @Body('reason') reason: string, @Req() req: any) {
    return this.adminService.updateReportStatus(+id, 'REMOVED', req.user.userId, reason, this.getIp(req));
  }

  @Get('reports/critical')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  getCriticalReports(@Req() req: any) {
    return this.adminService.getCriticalReports(this.getScope(req.user));
  }

  @Get('reports/flagged')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  getFlaggedReports(@Req() req: any) {
    return this.adminService.getFlaggedReports(this.getScope(req.user));
  }

  @Get('reports/flagged-queue')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  getFlaggedQueue(@Req() req: any) {
    return this.adminService.getFlaggedQueue(this.getScope(req.user));
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
      minReporterTrust: query.minReporterTrust ? +query.minReporterTrust : undefined,
      minFlaggedCount: query.minFlaggedCount ? +query.minFlaggedCount : undefined,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      id: query.id ? +query.id : undefined,
      title: query.title,
    }, this.getScope(req.user));
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

  @Post('reports/:id/request-evidence')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  requestMoreEvidence(@Param('id') id: string, @Body('message') message: string, @Req() req: any) {
    return this.adminService.requestMoreEvidence(+id, req.user.userId, message);
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
    return this.adminService.restoreReport(+id, req.user.userId, reason, this.getIp(req));
  }

  @Get('reports/:id/history')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  getReportHistory(@Param('id') id: string) {
    return this.adminService.getReportHistory(+id);
  }

  @Get('reports/:id/notes')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  getModerationNotes(@Param('id') id: string) {
    return this.adminService.getModerationNotes(+id);
  }

  @Post('reports/:id/notes')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  addModerationNote(@Param('id') id: string, @Body('content') content: string, @Req() req: any) {
    return this.adminService.addModerationNote(+id, req.user.userId, content);
  }


  @Get('users')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  getUsers(@Query() query: any, @Req() req: any) {
    return this.adminService.getUsers({
      search: query.search,
      status: query.status,
      role: query.role,
      minTrust: query.minTrust ? +query.minTrust : undefined,
      maxTrust: query.maxTrust ? +query.maxTrust : undefined,
      cityId: query.cityId ? +query.cityId : undefined,
      areaId: query.areaId ? +query.areaId : undefined,
    }, this.getScope(req.user)); // Fixed this.getScope(req) -> this.getScope(req.user)
  }

  @Get('users/export')
  @Roles('SUPER_ADMIN')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="users-export.csv"')
  exportUsers(@Req() req: any) {
    return this.adminService.exportUsersToCsv(req.user.userId);
  }

  @Get('users/:id')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  getUserDetail(@Param('id') id: string) {
    return this.adminService.getUserDetail(+id);
  }

  @Patch('users/:id/role')
  @Roles('SUPER_ADMIN')
  updateUserRole(@Param('id') id: string, @Body('role') role: 'USER' | 'ADMIN' | 'SUPER_ADMIN', @Req() req: any) {
    return this.adminService.updateUserRole(+id, role, req.user.userId);
  }

  @Patch('users/:id/scope')
  @Roles('SUPER_ADMIN')
  updateUserScope(
    @Param('id') id: string, 
    @Body('cityId') cityId: number | null, 
    @Body('areaId') areaId: number | null, 
    @Req() req: any
  ) {
    return this.adminService.updateUserScope(+id, cityId, areaId, req.user.userId);
  }

  @Post('users/:id/warn')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  @UseGuards(ScopeGuard)
  @Scoped('USER')
  warnUser(@Param('id') id: string, @Body('reason') reason: string, @Req() req: any) {
    return this.adminService.warnUser(+id, reason, req.user.userId, this.getIp(req));
  }

  @Post('users/:id/suspend')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  @UseGuards(ScopeGuard, AdminRateLimitGuard)
  @Scoped('USER')
  suspendUser(@Param('id') id: string, @Body('days') days: number, @Body('reason') reason: string, @Req() req: any) {
    return this.adminService.suspendUser(+id, days, reason, req.user.userId, this.getIp(req));
  }

  @Post('users/:id/ban')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  @UseGuards(ScopeGuard, AdminRateLimitGuard)
  @Scoped('USER')
  banUser(@Param('id') id: string, @Body('reason') reason: string, @Req() req: any) {
    return this.adminService.banUser(+id, reason, req.user.userId, this.getIp(req));
  }

  @Post('users/:id/reset-trust')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  @UseGuards(ScopeGuard)
  @Scoped('USER')
  resetTrustScore(@Param('id') id: string, @Body('reason') reason: string, @Req() req: any) {
    return this.adminService.resetTrustScore(+id, req.user.userId, reason, this.getIp(req));
  }

  @Post('users/:id/restore')
  @Roles('SUPER_ADMIN')
  restoreUser(@Param('id') id: string, @Body('reason') reason: string, @Req() req: any) {
    return this.adminService.restoreUser(+id, req.user.userId, reason, this.getIp(req));
  }

  @Get('locations')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  getLocations() {
    return this.adminService.getLocations();
  }

  @Get('countries')
  @Roles('SUPER_ADMIN')
  getCountries() {
    return this.adminService.getCountries();
  }

  @Post('countries')
  @Roles('SUPER_ADMIN')
  createCountry(@Body('name') name: string, @Req() req: any) {
    return this.adminService.createCountry(name, req.user.userId);
  }

  @Patch('countries/:id')
  @Roles('SUPER_ADMIN')
  updateCountry(@Param('id') id: string, @Body('name') name: string, @Req() req: any) {
    return this.adminService.updateCountry(+id, name, req.user.userId);
  }

  @Get('cities')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  getCities(@Query('countryId') countryId?: string) {
    return this.adminService.getCities(countryId ? +countryId : undefined);
  }

  @Get('areas')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  getAreas(@Req() req: any) {
    return this.adminService.getAreas(this.getScope(req.user));
  }

  @Get('areas/export')
  @Roles('SUPER_ADMIN')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="areas-export.csv"')
  async exportAreas(@Req() req: any) {
    return this.adminService.exportAreasToCsv(req.user.userId);
  }

  @Post('locations/cities')
  @Roles('SUPER_ADMIN')
  createCity(@Body('name') name: string, @Body('countryId') countryId: number, @Req() req: any) {
    return this.adminService.createCity(name, countryId, req.user.userId);
  }

  @Post('locations/areas')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  createArea(@Body('name') name: string, @Body('cityId') cityId: number, @Req() req: any) {
    // Note: A robust implementation would verify the admin has scope for this cityId
    return this.adminService.createArea(name, cityId, req.user.userId, req.user.cityId);
  }

  @Patch('cities/:id')
  @Roles('SUPER_ADMIN')
  updateCity(@Param('id') id: string, @Body() data: any, @Req() req: any) {
    return this.adminService.updateCity(+id, data, req.user.userId);
  }

  @Get('areas/:id/merge-preview')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  getMergePreview(@Param('id') id: string, @Query('targetId') targetId: string) {
    return this.adminService.getMergePreview(+id, +targetId);
  }

  @Post('locations/import')
  @Roles('SUPER_ADMIN')
  importLocations(@Body('csvData') csvData: string, @Req() req: any) {
    return this.adminService.importLocations(csvData, req.user.userId);
  }

  @Patch('areas/:id')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  @UseGuards(ScopeGuard)
  @Scoped('AREA')
  updateArea(@Param('id') id: string, @Body() data: any, @Req() req: any) {
    return this.adminService.updateArea(+id, data, req.user.userId, this.getIp(req));
  }

  @Post('areas/:id/merge')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  @UseGuards(ScopeGuard, AdminRateLimitGuard)
  @Scoped('AREA')
  mergeAreas(@Param('id') id: string, @Body('targetId') targetId: number, @Body('reason') reason: string, @Req() req: any) {
    return this.adminService.mergeAreas(+id, targetId, req.user.userId, reason, this.getIp(req), req.user.cityId);
  }

  @Post('areas/:id/disable')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  @UseGuards(ScopeGuard, AdminRateLimitGuard)
  @Scoped('AREA')
  disableArea(@Param('id') id: string, @Body('reason') reason: string, @Req() req: any) {
    return this.adminService.disableArea(+id, req.user.userId, reason, this.getIp(req));
  }

  @Post('areas/:id/restore')
  @Roles('SUPER_ADMIN')
  restoreArea(@Param('id') id: string, @Body('reason') reason: string, @Req() req: any) {
    return this.adminService.restoreArea(+id, req.user.userId, reason, this.getIp(req));
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

  // --- Admin Profile & Tools ---
  @Get('profile/sessions')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  getAdminSessions(@Req() req: any) {
    return this.adminService.getAdminSessions(req.user.userId);
  }

  @Post('profile/sessions/:id/revoke')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  revokeSession(@Param('id') id: string, @Req() req: any) {
    return this.adminService.revokeSession(+id, req.user.userId);
  }

  @Get('profile/api-keys')
  @Roles('SUPER_ADMIN')
  getApiKeys(@Req() req: any) {
    return this.adminService.getApiKeys(req.user.userId);
  }

  @Post('profile/api-keys')
  @Roles('SUPER_ADMIN')
  createApiKey(@Body('name') name: string, @Body('permissions') permissions: string[], @Req() req: any) {
    return this.adminService.createApiKey(req.user.userId, name, permissions);
  }

  @Delete('profile/api-keys/:id')
  @Roles('SUPER_ADMIN')
  deleteApiKey(@Param('id') id: string, @Req() req: any) {
    return this.adminService.deleteApiKey(+id, req.user.userId);
  }

  @Post('profile/switch-scope')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  switchScope(@Body('cityId') cityId: number | null, @Body('areaId') areaId: number | null, @Req() req: any) {
    return this.adminService.switchScope(req.user.userId, cityId, areaId);
  }

  // --- Super Admin: Admin Personnel Management ---
  @Get('management/admins')
  @Roles('SUPER_ADMIN')
  getAdmins() {
    return this.adminService.getAdmins();
  }

  @Post('management/admins')
  @Roles('SUPER_ADMIN')
  createAdmin(@Body() data: any, @Req() req: any) {
    return this.adminService.createAdmin(data, req.user.userId);
  }

  // --- Settings ---
  @Get('settings')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  getSettings(@Req() req: any) {
    return this.adminService.getAdminSettings(req.user.userId);
  }

  @Patch('settings/account')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  updateAccount(@Body() data: any, @Req() req: any) {
    return this.adminService.updateAccountSettings(req.user.userId, data);
  }

  @Patch('settings/notifications')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  updateNotifications(@Body() settings: any, @Req() req: any) {
    return this.adminService.updateNotificationSettings(req.user.userId, settings);
  }

  @Patch('settings/moderation')
  @Roles('ADMIN', 'MODERATOR', 'SUPER_ADMIN')
  updateModeration(@Body() preferences: any, @Req() req: any) {
    return this.adminService.updateModerationSettings(req.user.userId, preferences);
  }

  // --- Super Admin System Settings ---
  @Get('system-settings')
  @Roles('SUPER_ADMIN')
  getSystemSettings() {
    return this.adminService.getSystemSettings();
  }

  @Patch('system-settings/trust-config')
  @Roles('SUPER_ADMIN')
  updateTrustConfig(@Body() config: any, @Req() req: any) {
    return this.adminService.updateSystemTrustConfig(req.user.userId, config);
  }

  @Get('system-settings/urgency-colors')
  @Roles('SUPER_ADMIN')
  getUrgencyColors() {
    return this.adminService.getUrgencyColors();
  }

  @Patch('system-settings/urgency-colors')
  @Roles('SUPER_ADMIN')
  updateUrgencyColors(@Body() colors: any, @Req() req: any) {
    return this.adminService.updateUrgencyColors(req.user.userId, colors);
  }

  @Post('system-settings/maintenance')
  @Roles('SUPER_ADMIN')
  toggleMaintenanceMode(@Body('enabled') enabled: boolean, @Req() req: any) {
    return this.adminService.toggleMaintenanceMode(req.user.userId, enabled);
  }
}

