import { Injectable, Inject } from '@nestjs/common';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE_PROVIDER } from '../db/db.module';
import * as schema from '../db/schema';
import { eq, count, desc, and, gte, lt } from 'drizzle-orm';



@Injectable()
export class AdminService {
  constructor(
    @Inject(DRIZZLE_PROVIDER)
    private db: PostgresJsDatabase<typeof schema>,
  ) {}

  async getOverview() {
    const [userCount] = await this.db.select({ value: count() }).from(schema.users);
    const [reportCount] = await this.db.select({ value: count() }).from(schema.reports);
    
    // Reports today
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [reportsToday] = await this.db
      .select({ value: count() })
      .from(schema.reports)
      .where(gte(schema.reports.createdAt, startOfDay));

    // Critical reports
    const [criticalReports] = await this.db
      .select({ value: count() })
      .from(schema.reports)
      .where(eq(schema.reports.urgency, 'CRITICAL'));

    // Flagged reports (reports with more than 5 FAKE votes, for example)
    // This is a bit complex with current schema without a direct flagged field, 
    // but we can query reports where trustScore is low or FAKE reactions are high.
    // For now, let's use a placeholder trustScore < 30 as 'Flagged'
    const [flaggedReports] = await this.db
      .select({ value: count() })
      .from(schema.reports)
      .where(lt(schema.reports.trustScore, 30));

    return {
      totalUsers: userCount.value,
      totalReports: reportCount.value,
      reportsToday: reportsToday?.value || 0,
      criticalIssues: criticalReports?.value || 0,
      flaggedReports: flaggedReports?.value || 0,
    };
  }

  async getCriticalReports() {
    return this.db.query.reports.findMany({
      where: eq(schema.reports.urgency, 'CRITICAL'),
      with: {
        reporter: true,
        city: true,
        area: true,
      },
      orderBy: [desc(schema.reports.createdAt)],
      limit: 10,
    });
  }

  async getFlaggedReports() {
    // Reports with low trust score
    return this.db.query.reports.findMany({
      where: lt(schema.reports.trustScore, 30),
      with: {
        reporter: true,
        city: true,
        area: true,
        reactions: true, // To show fake votes count
      },
      orderBy: [schema.reports.trustScore],
      limit: 10,
    });
  }

  async getReports(filters: {
    cityId?: number;
    areaId?: number;
    categoryId?: number;
    urgency?: string;
    status?: string;
    minTrust?: number;
  }) {
    const where: any[] = [];
    if (filters.cityId) where.push(eq(schema.reports.cityId, filters.cityId));
    if (filters.areaId) where.push(eq(schema.reports.areaId, filters.areaId));
    if (filters.categoryId) where.push(eq(schema.reports.categoryId, filters.categoryId));
    if (filters.urgency) where.push(eq(schema.reports.urgency, filters.urgency as any));
    if (filters.status) where.push(eq(schema.reports.status, filters.status as any));
    if (filters.minTrust) where.push(gte(schema.reports.trustScore, filters.minTrust));

    return this.db.query.reports.findMany({
      where: where.length > 0 ? and(...where) : undefined,
      with: {
        reporter: true,
        category: true,
        city: true,
        area: true,
        media: true,
      },
      orderBy: [desc(schema.reports.createdAt)],
      limit: 100,
    });
  }

  async archiveReport(id: number, adminId: number) {
    const result = await this.db
      .update(schema.reports)
      .set({ status: 'ARCHIVED' })
      .where(eq(schema.reports.id, id))
      .returning();
    
    await this.logAction(adminId, 'ARCHIVE_REPORT', `Archived report #${id}`, id);
    return result;
  }

  async mergeReports(primaryId: number, duplicateId: number, adminId: number) {
    // Basic merge logic: mark duplicate as REMOVED
    await this.db
      .update(schema.reports)
      .set({ status: 'REMOVED' })
      .where(eq(schema.reports.id, duplicateId));
    
    await this.logAction(adminId, 'MERGE_REPORTS', `Merged report #${duplicateId} into #${primaryId}`, primaryId);
    return { success: true, message: `Report ${duplicateId} merged into ${primaryId}` };
  }


  async updateReportStatus(id: number, status: any, adminId: number) {
    const result = await this.db
      .update(schema.reports)
      .set({ status })
      .where(eq(schema.reports.id, id))
      .returning();
    
    await this.logAction(adminId, 'UPDATE_STATUS', `Status updated to ${status} for report #${id}`, id);
    return result;
  }

  async getUsers() {
    return this.db.query.users.findMany({
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

  async logAction(adminId: number, action: string, reason: string, targetId?: number) {
    return this.db.insert(schema.auditLogs).values({
      adminId,
      action,
      reason,
      targetId,
    });
  }

}
