import { Injectable, Inject } from '@nestjs/common';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE_PROVIDER } from '../db/db.module';
import * as schema from '../db/schema';
import { eq, count, desc, and, gte, lt, ne, lte, inArray } from 'drizzle-orm';


@Injectable()
export class AdminService {
  constructor(
    @Inject(DRIZZLE_PROVIDER)
    private db: PostgresJsDatabase<typeof schema>,
  ) {}

  async getOverview(scope?: { cityId?: number; areaId?: number }) {
    const { reports, users } = schema;
    const reportFilters: any[] = [ne(reports.status, 'REMOVED' as any)];
    const userFilters: any[] = [ne(users.status, 'BANNED' as any)];

    if (scope?.cityId) {
      reportFilters.push(eq(reports.cityId, scope.cityId));
      userFilters.push(eq(users.cityId, scope.cityId));
    }
    if (scope?.areaId) {
      reportFilters.push(eq(reports.areaId, scope.areaId));
      userFilters.push(eq(users.areaId, scope.areaId));
    }

    // Resolved Today logic (last 24h)
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    const resolvedTodayFilters = [...reportFilters, eq(reports.status, 'RESOLVED' as any), gte(reports.updatedAt, oneDayAgo)];

    const [userCount] = await this.db.select({ value: count() }).from(users).where(and(...userFilters));
    const [reportCount] = await this.db.select({ value: count() }).from(reports).where(and(...reportFilters));
    const [criticalCount] = await this.db.select({ value: count() }).from(reports).where(and(...reportFilters, eq(reports.urgency, 'CRITICAL' as any)));
    const [flaggedCount] = await this.db.select({ value: count() }).from(reports).where(and(...reportFilters, lt(reports.confidenceScore, 30)));
    const [resolvedTodayCount] = await this.db.select({ value: count() }).from(reports).where(and(...resolvedTodayFilters));

    // Critical Queue (Top 10 newest critical reports in scope that are not resolved/removed)
    const criticalQueue = await this.db.query.reports.findMany({
      where: and(...reportFilters, eq(reports.urgency, 'CRITICAL' as any), ne(reports.status, 'RESOLVED' as any)),
      limit: 10,
      orderBy: [desc(reports.createdAt)],
      with: {
        category: true,
        area: true,
        city: true,
        media: true
      }
    });

    // Flagged Trends (Top 5 lowest confidence score reports)
    const flaggedTrends = await this.db.query.reports.findMany({
      where: and(...reportFilters, lt(reports.confidenceScore, 40)),
      limit: 5,
      orderBy: [reports.confidenceScore],
      with: {
        category: true,
        area: true
      }
    });

    return {
      totalUsers: userCount.value,
      totalReports: reportCount.value,
      criticalIssues: criticalCount.value,
      flaggedReports: flaggedCount.value,
      resolvedToday: resolvedTodayCount.value,
      criticalQueue,
      flaggedTrends
    };
  }

  async getCriticalReports(scope?: { cityId?: number; areaId?: number }) {
    const where: any[] = [eq(schema.reports.urgency, 'CRITICAL')];
    if (scope?.cityId) where.push(eq(schema.reports.cityId, scope.cityId));
    if (scope?.areaId) where.push(eq(schema.reports.areaId, scope.areaId));

    return this.db.query.reports.findMany({
      where: and(...where),
      with: {
        reporter: true,
        city: true,
        area: true,
      },
      orderBy: [desc(schema.reports.createdAt)],
      limit: 10,
    });
  }

  async getFlaggedReports(scope?: { cityId?: number; areaId?: number }) {
    const where: any[] = [lt(schema.reports.confidenceScore, 30)];
    if (scope?.cityId) where.push(eq(schema.reports.cityId, scope.cityId));
    if (scope?.areaId) where.push(eq(schema.reports.areaId, scope.areaId));

    return this.db.query.reports.findMany({
      where: and(...where),
      with: {
        reporter: true,
        city: true,
        area: true,
        reactions: true,
      },
      orderBy: [schema.reports.confidenceScore],
      limit: 10,
    });
  }

  async getReports(filters: {
    cityId?: number;
    areaId?: number;
    categoryId?: number;
    urgency?: string;
    status?: string;
    minConfidence?: number;
    maxConfidence?: number;
    minReporterTrust?: number;
    startDate?: Date;
    endDate?: Date;
    id?: number;
  }, scope?: { cityId?: number; areaId?: number }) {
    const where: any[] = [];
    
    // Enforce scope
    const finalCityId = scope?.cityId || filters.cityId;
    const finalAreaId = scope?.areaId || filters.areaId;

    if (filters.id) where.push(eq(schema.reports.id, filters.id));
    if (finalCityId) where.push(eq(schema.reports.cityId, finalCityId));
    if (finalAreaId) where.push(eq(schema.reports.areaId, finalAreaId));
    if (filters.categoryId) where.push(eq(schema.reports.categoryId, filters.categoryId));
    if (filters.urgency) where.push(eq(schema.reports.urgency, filters.urgency as any));
    if (filters.status) where.push(eq(schema.reports.status, filters.status as any));
    
    if (filters.minConfidence !== undefined) where.push(gte(schema.reports.confidenceScore, filters.minConfidence));
    if (filters.maxConfidence !== undefined) where.push(lte(schema.reports.confidenceScore, filters.maxConfidence));
    
    if (filters.startDate) where.push(gte(schema.reports.createdAt, filters.startDate));
    if (filters.endDate) where.push(lte(schema.reports.createdAt, filters.endDate));

    return this.db.query.reports.findMany({
      where: where.length > 0 ? and(...where) : undefined,
      with: {
        reporter: true,
        category: true,
        city: true,
        area: true,
        media: true,
        reactions: true,
      },
      orderBy: [desc(schema.reports.createdAt)],
    });
  }

  async exportReports(filters: any, scope?: { cityId?: number; areaId?: number }) {
    const reports = await this.getReports(filters, scope);
    
    const header = ['ID', 'Title', 'Reporter', 'Status', 'Urgency', 'Area', 'City', 'Confidence', 'Created At'];
    const rows = reports.map(r => [
      r.id,
      `"${r.title.replace(/"/g, '""')}"`,
      r.reporter?.fullName || 'Unknown',
      r.status,
      r.urgency,
      r.area?.name || 'N/A',
      r.city?.name || 'N/A',
      r.confidenceScore,
      r.createdAt.toISOString()
    ]);

    const csvContent = [header, ...rows].map(row => row.join(',')).join('\n');
    return csvContent;
  }

  async bulkUpdateStatus(ids: number[], status: any, adminId: number, reason: string) {
    const results = await this.db
      .update(schema.reports)
      .set({ status, updatedAt: new Date() })
      .where(inArray(schema.reports.id, ids))
      .returning();
    
    await this.logDeepAction(adminId, 'BULK_STATUS_CHANGE', 'REPORT', ids[0], reason, null, JSON.stringify({ status, ids }));
    return results;
  }

  async mergeReports(masterId: number, duplicateIds: number[], adminId: number, reason: string) {
    // 1. Mark duplicates as ARCHIVED and point to master
    await this.db
      .update(schema.reports)
      .set({ 
        status: 'ARCHIVED' as any, 
        masterReportId: masterId,
        updatedAt: new Date() 
      })
      .where(inArray(schema.reports.id, duplicateIds));
    
    await this.logDeepAction(adminId, 'MERGE_REPORTS', 'REPORT', masterId, reason, null, JSON.stringify({ mergedIds: duplicateIds }));
    
    return { success: true };
  }

  async restoreReport(id: number, adminId: number, reason: string) {
    // Super Admin only logic should be in controller guard, but we'll check here too if needed
    const result = await this.db
      .update(schema.reports)
      .set({ status: 'REPORTED' as any, updatedAt: new Date() })
      .where(eq(schema.reports.id, id))
      .returning();
    
    await this.logDeepAction(adminId, 'RESTORE_REPORT', 'REPORT', id, reason, null, null);
    return result;
  }

  // Deep Logging for immutable admin_actions table
  async logDeepAction(adminId: number, action: string, targetType: string, targetId: number, reason: string, before?: any, after?: any) {
    return this.db.insert(schema.adminActions).values({
      adminId,
      action,
      targetType,
      targetId,
      reason,
      beforeJson: before ? JSON.stringify(before) : null,
      afterJson: after ? JSON.stringify(after) : null,
    });
  }

  async getReportHistory(reportId: number) {
    return this.db.query.adminActions.findMany({
      where: and(
        eq(schema.adminActions.targetType, 'REPORT'),
        eq(schema.adminActions.targetId, reportId)
      ),
      with: {
        admin: true
      },
      orderBy: [desc(schema.adminActions.createdAt)]
    });
  }

  async archiveReport(id: number, adminId: number, reason: string) {
    const result = await this.db
      .update(schema.reports)
      .set({ status: 'ARCHIVED' as any })
      .where(eq(schema.reports.id, id))
      .returning();
    
    await this.logAction(adminId, 'ARCHIVE_REPORT', reason, id);
    return result;
  }



  async updateReportStatus(id: number, status: any, adminId: number, reason: string) {
    const result = await this.db
      .update(schema.reports)
      .set({ status, updatedAt: new Date() })
      .where(eq(schema.reports.id, id))
      .returning();
    
    await this.logAction(adminId, `STATUS_CHANGE_${status}`, reason, id);
    return result;
  }

  async getUsers(scope?: { cityId?: number; areaId?: number }) {
    const where: any[] = [];
    if (scope?.cityId) where.push(eq(schema.users.cityId, scope.cityId));
    if (scope?.areaId) where.push(eq(schema.users.areaId, scope.areaId));

    return this.db.query.users.findMany({
      where: where.length > 0 ? and(...where) : undefined,
      with: {
        reports: true,
        comments: true,
      },
      orderBy: [desc(schema.users.createdAt)],
      limit: 100,
    });
  }

  async warnUser(id: number, reason: string, adminId: number) {
    await this.db.insert(schema.auditLogs).values({
      adminId,
      action: 'WARN_USER',
      reason,
      targetId: id,
    });

    
    await this.db.insert(schema.notifications).values({
      userId: id,
      type: 'MODERATION',
      message: `You have received a formal warning: ${reason}`,
    });

    return { success: true };
  }

  async suspendUser(id: number, days: number, reason: string, adminId: number) {
    const until = new Date();
    until.setDate(until.getDate() + days);

    const result = await this.db
      .update(schema.users)
      .set({ 
        status: 'SUSPENDED',
        suspensionUntil: until,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, id))
      .returning();
    
    await this.logAction(adminId, 'SUSPEND_USER', `Suspended for ${days} days: ${reason}`, id);
    return result;
  }

  async banUser(id: number, reason: string, adminId: number) {
    const result = await this.db
      .update(schema.users)
      .set({ 
        status: 'BANNED',
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, id))
      .returning();
    
    await this.logAction(adminId, 'BAN_USER', `Banned: ${reason}`, id);
    return result;
  }

  async resetTrustScore(id: number, adminId: number) {
    const result = await this.db
      .update(schema.users)
      .set({ 
        trustScore: 50,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, id))
      .returning();
    
    await this.logAction(adminId, 'RESET_TRUST', `Trust score reset to 50`, id);
    return result;
  }



  async updateUserRole(id: number, role: any, adminId: number) {
    const result = await this.db
      .update(schema.users)
      .set({ role })
      .where(eq(schema.users.id, id))
      .returning();
    
    await this.logAction(adminId, 'UPDATE_ROLE', `Role updated to ${role} for user #${id}`, id);
    return result;
  }

  async getLocations() {
    const cities = await this.db.query.cities.findMany({
      with: {
        areas: true,
      },
    });
    return cities;
  }

  async createCity(name: string, countryId: number, adminId: number) {
    const result = await this.db.insert(schema.cities).values({ name, countryId }).returning();
    await this.logAction(adminId, 'CREATE_CITY', `Created city: ${name}`);
    return result;
  }

  async createArea(name: string, cityId: number, adminId: number) {
    const result = await this.db.insert(schema.areas).values({ name, cityId }).returning();
    await this.logAction(adminId, 'CREATE_AREA', `Created area: ${name}`);
    return result;
  }


  // --- Category Management ---
  async getCategories() {
    return this.db.query.categories.findMany();
  }

  async createCategory(name: string, adminId: number, icon?: string) {
    const result = await this.db.insert(schema.categories).values({ name, icon }).returning();
    await this.logAction(adminId, 'CREATE_CATEGORY', `Created category: ${name}`);
    return result;
  }

  async updateCategory(id: number, data: { name?: string; icon?: string; isActive?: boolean }, adminId: number) {
    const result = await this.db
      .update(schema.categories)
      .set(data)
      .where(eq(schema.categories.id, id))
      .returning();
    
    await this.logAction(adminId, 'UPDATE_CATEGORY', `Updated category #${id}`, id);
    return result;
  }


  // --- Broadcast Alerts ---
  async sendBroadcast(message: string, adminId: number, areaId?: number) {
    // Send to all users or users in an area
    const usersToNotify = await this.db.query.users.findMany(); // Simplification for MVP
    
    // In a real app, you'd use a background job or specific subscription logic
    for (const user of usersToNotify) {
      await this.db.insert(schema.notifications).values({
        userId: user.id,
        type: 'BROADCAST',
        message: `[OFFICIAL] ${message}`,
      });
    }

    // Log the broadcast
    await this.logAction(adminId, 'SEND_BROADCAST', `Broadcast: ${message.substring(0, 50)}...`, 0);
    
    return { success: true, count: usersToNotify.length };
  }


  // --- Audit Logs ---
  async getAuditLogs() {
    return this.db.query.auditLogs.findMany({
      with: {
        admin: true,
      },
      orderBy: [desc(schema.auditLogs.createdAt)],
      limit: 100,
    });
  }

  async getSystemStatus() {
    // These would typically come from real monitoring hooks
    return {
      apiLatency: '42ms',
      errorRate: '0.01%',
      workerBacklog: 12,
      s3Usage: '1.2GB',
      isEmergencyMode: false, // Planned feature
    };
  }

  async logAction(adminId: number, action: string, reason: string, targetId?: number) {
    return this.db.insert(schema.auditLogs).values({
      adminId,
      action,
      reason,
      targetId,
    });
  }
}
