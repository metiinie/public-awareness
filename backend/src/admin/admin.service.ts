import { Injectable, Inject, Logger } from '@nestjs/common';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { DRIZZLE_PROVIDER } from '../db/db.module';
import * as schema from '../db/schema';
import { eq, count, desc, and, or, gte, lt, ne, lte, inArray, ilike, sql, avg } from 'drizzle-orm';


import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @Inject(DRIZZLE_PROVIDER)
    private db: PostgresJsDatabase<typeof schema>,
    private notificationsService: NotificationsService,
  ) {}

  async getOverview(scope?: { cityId?: number; areaId?: number }) {
    const { reports, users, reactions } = schema;
    const reportFilters: any[] = [ne(reports.status, 'REMOVED' as any)];

    if (scope?.cityId) {
      reportFilters.push(eq(reports.cityId, scope.cityId));
    }
    if (scope?.areaId) {
      reportFilters.push(eq(reports.areaId, scope.areaId));
    }

    // counts: total reports, critical/unverified, flagged-for-review, reports resolved today.
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);

    const [totalReports] = await this.db.select({ value: count() }).from(reports).where(and(...reportFilters));
    const [criticalUnverified] = await this.db.select({ value: count() }).from(reports).where(and(
      ...reportFilters, 
      eq(reports.urgency, 'CRITICAL' as any),
      eq(reports.status, 'REPORTED' as any)
    ));
    const [flaggedForReview] = await this.db.select({ value: count() }).from(reports).where(and(
      ...reportFilters, 
      eq(reports.status, 'UNDER_REVIEW' as any)
    ));
    const [resolvedToday] = await this.db.select({ value: count() }).from(reports).where(and(
      ...reportFilters, 
      eq(reports.status, 'RESOLVED' as any), 
      gte(reports.updatedAt, oneDayAgo)
    ));

    // Priority Queue: NEWEST critical reports in scope with quick actions (Verify / Resolve / Flag for review).
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

    // Flagged Trends: top 5 reports flagged by votes as Fake.
    const flaggedTrends = await this.db
      .select({
        id: reports.id,
        title: reports.title,
        fakeCount: count(reactions.id),
      })
      .from(reports)
      .innerJoin(reactions, eq(reports.id, reactions.reportId))
      .where(and(
        ...reportFilters,
        eq(reactions.type, 'FAKE')
      ))
      .groupBy(reports.id, reports.title)
      .orderBy(desc(count(reactions.id)))
      .limit(5);

    // Super Admin: Suspicious patterns (e.g., bursts of fake votes)
    let suspiciousPatterns: any[] = [];
    if (!scope) { // Global scope implies Super Admin
      suspiciousPatterns = await this.db
        .select({
          reportId: reactions.reportId,
          title: reports.title,
          recentFakeVotes: count(reactions.id),
        })
        .from(reactions)
        .innerJoin(reports, eq(reactions.reportId, reports.id))
        .where(and(
          eq(reactions.type, 'FAKE'),
          gte(reactions.createdAt, oneDayAgo)
        ))
        .groupBy(reactions.reportId, reports.title)
        .having(sql`count(${reactions.id}) > 5`) // Burst of > 5 fake votes in 24h
        .orderBy(desc(count(reactions.id)))
        .limit(5);
    }

    return {
      totalReports: totalReports.value,
      criticalUnverified: criticalUnverified.value,
      flaggedForReview: flaggedForReview.value,
      resolvedToday: resolvedToday.value,
      criticalQueue,
      flaggedTrends,
      suspiciousPatterns
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
    minFlaggedCount?: number;
    startDate?: Date;
    endDate?: Date;
    id?: number;
    title?: string;
  }, scope?: { cityId?: number; areaId?: number }) {
    const where: any[] = [];
    
    // Enforce scope
    const finalCityId = scope?.cityId || filters.cityId;
    const finalAreaId = scope?.areaId || filters.areaId;

    if (filters.id) where.push(eq(schema.reports.id, filters.id));
    if (filters.title) {
      where.push(or(
        ilike(schema.reports.title, `%${filters.title}%`),
        sql`EXISTS (SELECT 1 FROM ${schema.users} u WHERE u.id = ${schema.reports.reporterId} AND u.full_name ILIKE ${`%${filters.title}%`})`
      ));
    }
    if (finalCityId) where.push(eq(schema.reports.cityId, finalCityId));
    if (finalAreaId) where.push(eq(schema.reports.areaId, finalAreaId));
    if (filters.categoryId) where.push(eq(schema.reports.categoryId, filters.categoryId));
    if (filters.urgency) where.push(eq(schema.reports.urgency, filters.urgency as any));
    if (filters.status) where.push(eq(schema.reports.status, filters.status as any));
    
    if (filters.minConfidence !== undefined) where.push(gte(schema.reports.confidenceScore, filters.minConfidence));
    if (filters.maxConfidence !== undefined) where.push(lte(schema.reports.confidenceScore, filters.maxConfidence));
    
    if (filters.minReporterTrust !== undefined) {
      where.push(sql`EXISTS (SELECT 1 FROM ${schema.users} u WHERE u.id = ${schema.reports.reporterId} AND u.trust_score >= ${filters.minReporterTrust})`);
    }

    if (filters.startDate) where.push(gte(schema.reports.createdAt, filters.startDate));
    if (filters.endDate) where.push(lte(schema.reports.createdAt, filters.endDate));

    if (filters.minFlaggedCount !== undefined && filters.minFlaggedCount > 0) {
      where.push(sql`EXISTS (SELECT 1 FROM ${schema.reactions} r WHERE r.report_id = ${schema.reports.id} AND r.type = 'FAKE' GROUP BY r.report_id HAVING count(r.id) >= ${filters.minFlaggedCount})`);
    }
    const reportsQuery = this.db.query.reports.findMany({
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

    return reportsQuery;
  }

  async getFlaggedQueue(scope?: { cityId?: number; areaId?: number }) {
    const { reports, reactions } = schema;
    const reportFilters: any[] = [
      lt(reports.confidenceScore, 40),
      eq(reports.status, 'REPORTED' as any)
    ];

    if (scope?.cityId) reportFilters.push(eq(reports.cityId, scope.cityId));
    if (scope?.areaId) reportFilters.push(eq(reports.areaId, scope.areaId));

    // Find reports where FAKE Reactions > 3
    const flagged = await this.db
      .select({
        id: reports.id,
        fakeCount: count(reactions.id),
      })
      .from(reports)
      .innerJoin(reactions, eq(reports.id, reactions.reportId))
      .where(and(...reportFilters, eq(reactions.type, 'FAKE')))
      .groupBy(reports.id)
      .having(sql`count(${reactions.id}) >= 3`)
      .limit(20);

    if (flagged.length === 0) return [];

    return this.db.query.reports.findMany({
      where: inArray(reports.id, flagged.map(f => f.id)),
      with: {
        reporter: true,
        category: true,
        area: true,
        media: true,
        reactions: true
      },
      orderBy: [desc(reports.confidenceScore)]
    });
  }

  async requestMoreEvidence(reportId: number, adminId: number, message: string) {
    const report = await this.db.query.reports.findFirst({
      where: eq(schema.reports.id, reportId)
    });
    if (!report) throw new Error('Report not found');

    await this.db.insert(schema.notifications).values({
      userId: report.reporterId,
      reportId: reportId,
      type: 'MODERATION_REQUEST',
      message: `Moderator Request: ${message}`
    });

    await this.logDeepAction(adminId, 'REQUEST_EVIDENCE', 'REPORT', reportId, message);
    return { success: true };
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

  async restoreReport(id: number, adminId: number, reason: string, ip?: string) {
    const result = await this.db
      .update(schema.reports)
      .set({ status: 'REPORTED' as any, updatedAt: new Date() })
      .where(eq(schema.reports.id, id))
      .returning();
    await this.logDeepAction(adminId, 'RESTORE_REPORT', 'REPORT', id, reason, null, { status: 'REPORTED' }, ip);
    return result;
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
  
  async getModerationNotes(reportId: number) {
    return this.db.query.moderationNotes.findMany({
      where: eq(schema.moderationNotes.reportId, reportId),
      with: {
        admin: true
      },
      orderBy: [desc(schema.moderationNotes.createdAt)]
    });
  }

  async addModerationNote(reportId: number, adminId: number, content: string) {
    const result = await this.db.insert(schema.moderationNotes).values({
      reportId,
      adminId,
      content
    }).returning();
    
    await this.logAction(adminId, 'ADD_MODERATION_NOTE', `Note added to report #${reportId}`, reportId);
    return result[0];
  }

  async archiveReport(id: number, adminId: number, reason: string) {
    const result = await this.db
      .update(schema.reports)
      .set({ status: 'ARCHIVED' as any })
      .where(eq(schema.reports.id, id))
      .returning();
    
    await this.logDeepAction(adminId, 'ARCHIVE_REPORT', 'REPORT', id, reason, null, null);
    return result;
  }



  async updateReportStatus(id: number, status: any, adminId: number, reason: string, ip?: string) {
    const report = await this.db.query.reports.findFirst({
      where: eq(schema.reports.id, id),
      with: { area: true, category: true }
    });
    if (!report) throw new Error('Report not found');

    const result = await this.db
      .update(schema.reports)
      .set({ status, updatedAt: new Date() })
      .where(eq(schema.reports.id, id))
      .returning();
    
    // Notify Reporter
    await this.db.insert(schema.notifications).values({
      userId: report.reporterId,
      reportId: id,
      type: 'STATUS_CHANGE',
      message: `Moderation Update: Your report "${report.title}" is now ${status}. Reason: ${reason}`
    });

    // Notify Subscribers in the area
    if (report.areaId) {
      const subscribers = await this.db.query.subscriptions.findMany({
        where: eq(schema.subscriptions.areaId, report.areaId)
      });
      
      for (const sub of subscribers) {
        if (sub.userId !== report.reporterId) { // Don't notify reporter twice
          await this.db.insert(schema.notifications).values({
            userId: sub.userId,
            reportId: id,
            type: 'STATUS_CHANGE',
            message: `Update in your area: Report "${report.title}" is now ${status}.`
          });
        }
      }
    }

    await this.logDeepAction(adminId, `STATUS_CHANGE_${status}`, 'REPORT', id, reason, { status: report.status }, { status }, ip);
    return result[0];
  }

  async getUsers(filters: { search?: string; status?: string; minTrust?: number; maxTrust?: number; role?: string; cityId?: number; areaId?: number }, scope?: { cityId?: number; areaId?: number }) {
    const { users, reports, reactions, moderationReports } = schema;
    const where: any[] = [];
    
    // Scoping
    const finalCityId = scope?.cityId || filters.cityId;
    const finalAreaId = scope?.areaId || filters.areaId;

    if (finalCityId) where.push(eq(users.cityId, finalCityId));
    if (finalAreaId) where.push(eq(users.areaId, finalAreaId));
    if (filters.status) where.push(eq(users.status, filters.status as any));
    if (filters.role) where.push(eq(users.role, filters.role as any));
    if (filters.minTrust !== undefined) where.push(gte(users.trustScore, filters.minTrust));
    if (filters.maxTrust !== undefined) where.push(lte(users.trustScore, filters.maxTrust));
    
    if (filters.search) {
      where.push(or(
        ilike(users.fullName, `%${filters.search}%`),
        ilike(users.email, `%${filters.search}%`)
      ));
    }

    // Select with aggregations for table view
    return this.db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        avatar: users.avatar,
        role: users.role,
        status: users.status,
        trustScore: users.trustScore,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        reportsCount: sql<number>`(SELECT count(*) FROM ${reports} WHERE ${reports.reporterId} = ${users.id})`,
        votesCount: sql<number>`(SELECT count(*) FROM ${reactions} WHERE ${reactions.userId} = ${users.id})`,
        flagsCount: sql<number>`(SELECT count(*) FROM ${moderationReports} WHERE ${moderationReports.reporterId} = ${users.id})`,
      })
      .from(users)
      .where(where.length > 0 ? and(...where) : undefined)
      .orderBy(desc(users.createdAt));
  }

  async exportUsersToCsv(adminId: number) {
    const { users } = schema;
    const allUsers = await this.db.select().from(users).orderBy(desc(users.createdAt));
    
    const header = 'id,fullName,email,role,status,trustScore,createdAt\n';
    const rows = allUsers.map(u => 
      `${u.id},"${u.fullName}","${u.email}",${u.role},${u.status},${u.trustScore},${u.createdAt.toISOString()}`
    ).join('\n');

    await this.logAction(adminId, 'EXPORT_USERS', 'Global user export for audit purposes');
    return header + rows;
  }

  async getUserDetail(id: number) {
    const user = await this.db.query.users.findFirst({
      where: eq(schema.users.id, id),
      with: {
        reports: {
          with: { category: true, city: true, area: true },
          orderBy: [desc(schema.reports.createdAt)],
          limit: 20
        },
        comments: {
          with: { report: true },
          orderBy: [desc(schema.comments.createdAt)],
          limit: 20
        },
        warnings: { 
          with: { admin: true },
          orderBy: [desc(schema.userWarnings.createdAt)]
        },
        suspensions: {
          with: { admin: true },
          orderBy: [desc(schema.userSuspensions.createdAt)]
        }
      }
    });

    if (!user) return null;

    // Additional activity: Votes given
    const votes = await this.db.query.reactions.findMany({
      where: eq(schema.reactions.userId, id),
      with: { report: true },
      orderBy: [desc(schema.reactions.createdAt)],
      limit: 20
    });

    // Flags raised
    const flags = await this.db.query.moderationReports.findMany({
      where: eq(schema.moderationReports.reporterId, id),
      with: { report: true },
      orderBy: [desc(schema.moderationReports.createdAt)],
      limit: 20
    });

    // Trust History Timeline (from admin actions)
    const trustHistory = await this.db.query.adminActions.findMany({
      where: and(
        eq(schema.adminActions.targetType, 'USER'),
        eq(schema.adminActions.targetId, id)
      ),
      with: { admin: true },
      orderBy: [desc(schema.adminActions.createdAt)]
    });

    return {
      ...user,
      votes,
      flags,
      trustHistory
    };
  }

  async warnUser(id: number, reason: string, adminId: number, ip?: string) {
    await this.db.insert(schema.userWarnings).values({ userId: id, adminId, reason });
    await this.db.insert(schema.notifications).values({
      userId: id,
      type: 'MODERATION',
      message: `⚠️ You have received a formal warning: ${reason}`,
    });
    await this.logDeepAction(adminId, 'WARN_USER', 'USER', id, reason, null, null, ip);
    return { success: true };
  }

  async suspendUser(id: number, days: number, reason: string, adminId: number, ip?: string) {
    const until = new Date();
    until.setDate(until.getDate() + days);

    await this.db.update(schema.users).set({ 
      status: 'SUSPENDED',
      suspensionUntil: until,
      updatedAt: new Date(),
    }).where(eq(schema.users.id, id));

    await this.db.insert(schema.userSuspensions).values({ userId: id, adminId, reason, durationDays: days, expiresAt: until });

    await this.db.insert(schema.notifications).values({
      userId: id,
      type: 'MODERATION',
      message: `🔒 Your account has been suspended for ${days} day(s): ${reason}. It will be reinstated on ${until.toLocaleDateString()}.`,
    });

    await this.logDeepAction(adminId, 'SUSPEND_USER', 'USER', id, reason, { status: 'ACTIVE' }, { status: 'SUSPENDED', until }, ip);
    return { success: true };
  }

  async banUser(id: number, reason: string, adminId: number, ip?: string) {
    await this.db.update(schema.users).set({ status: 'BANNED', updatedAt: new Date() }).where(eq(schema.users.id, id));

    await this.db.insert(schema.notifications).values({
      userId: id,
      type: 'MODERATION',
      message: `❌ Your account has been permanently banned: ${reason}. Contact support to appeal.`,
    });

    await this.logDeepAction(adminId, 'BAN_USER', 'USER', id, reason, { status: 'ACTIVE' }, { status: 'BANNED' }, ip);
    return { success: true };
  }

  async resetTrustScore(id: number, adminId: number, reason: string, ip?: string) {
    const result = await this.db.update(schema.users).set({ trustScore: 50, updatedAt: new Date() }).where(eq(schema.users.id, id)).returning();
    await this.logDeepAction(adminId, 'RESET_TRUST', 'USER', id, reason, { trustScore: 'unknown' }, { trustScore: 50 }, ip);
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

  async updateUserScope(id: number, cityId: number | null, areaId: number | null, adminId: number) {
    const result = await this.db
      .update(schema.users)
      .set({ cityId, areaId })
      .where(eq(schema.users.id, id))
      .returning();
    
    await this.logAction(adminId, 'UPDATE_SCOPE', `Scope updated (city: ${cityId}, area: ${areaId}) for user #${id}`, id);
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

  async getAreas(scope?: { cityId?: number }) {
    const where = scope?.cityId ? eq(schema.areas.cityId, scope.cityId) : undefined;
    
    // In a real production app, you might do a complex join or subquery to get stats efficiently.
    // For MVP, we'll fetch areas and then enrich them, or use a relation if Drizzle stats permit.
    // Given the raw requirements, we'll fetch them and append basic stats.
    
    const allAreas = await this.db.query.areas.findMany({
      where,
      with: { city: true },
      orderBy: [schema.areas.name]
    });

    // Enrich with stats out of band for MVP simplicity (or use a view/custom SQL)
    const enrichedAreas = await Promise.all(allAreas.map(async (area) => {
      // Reports last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const [recentReports] = await this.db.select({ value: count() })
        .from(schema.reports)
        .where(and(eq(schema.reports.areaId, area.id), gte(schema.reports.createdAt, thirtyDaysAgo)));

      // Unresolved critical
      const [unresolvedCritical] = await this.db.select({ value: count() })
        .from(schema.reports)
        .where(and(
          eq(schema.reports.areaId, area.id), 
          eq(schema.reports.urgency, 'CRITICAL' as any),
          ne(schema.reports.status, 'RESOLVED' as any),
          ne(schema.reports.status, 'REMOVED' as any)
        ));

      return {
        ...area,
        stats: {
          recentReports: recentReports.value,
          unresolvedCritical: unresolvedCritical.value
        }
      };
    }));

    return enrichedAreas;
  }

  async getMergePreview(sourceId: number, targetId: number) {
    const reportCount = await this.db.select({ value: count() })
      .from(schema.reports)
      .where(eq(schema.reports.areaId, sourceId));
    
    const userCount = await this.db.select({ value: count() })
      .from(schema.users)
      .where(eq(schema.users.areaId, sourceId));

    const subCount = await this.db.select({ value: count() })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.areaId, sourceId));

    return {
      reports: reportCount[0].value,
      users: userCount[0].value,
      subscriptions: subCount[0].value
    };
  }

  async getCountries() {
    return this.db.select().from(schema.countries).orderBy(schema.countries.name);
  }

  async createCountry(name: string, adminId: number) {
    const result = await this.db.insert(schema.countries).values({ name }).returning();
    await this.logAction(adminId, 'CREATE_COUNTRY', `Created country: ${name}`);
    return result;
  }

  async updateCountry(id: number, name: string, adminId: number) {
    const result = await this.db.update(schema.countries).set({ name }).where(eq(schema.countries.id, id)).returning();
    await this.logAction(adminId, 'UPDATE_COUNTRY', `Updated country #${id} to ${name}`);
    return result;
  }

  async getCities(countryId?: number) {
    const where = countryId ? eq(schema.cities.countryId, countryId) : undefined;
    return this.db.query.cities.findMany({
      where,
      with: { country: true },
      orderBy: [schema.cities.name]
    });
  }

  async createCity(name: string, countryId: number, adminId: number) {
    const result = await this.db.insert(schema.cities).values({ name, countryId }).returning();
    await this.logAction(adminId, 'CREATE_CITY', `Created city: ${name}`);
    return result;
  }

  async updateCity(id: number, data: { name?: string; countryId?: number }, adminId: number) {
    const result = await this.db.update(schema.cities).set(data).where(eq(schema.cities.id, id)).returning();
    await this.logAction(adminId, 'UPDATE_CITY', `Updated city #${id}`);
    return result;
  }

  async createArea(name: string, cityId: number, adminId: number, adminCityId?: number | null) {
    if (adminCityId && adminCityId !== cityId) {
      throw new Error('Unauthorized: Area city must match your assigned city scope');
    }
    const result = await this.db.insert(schema.areas).values({ name, cityId }).returning();
    await this.logAction(adminId, 'CREATE_AREA', `Created area: ${name}`);
    return result;
  }

  async updateArea(id: number, data: { name?: string; aliases?: string[] }, adminId: number, ip?: string) {
    const result = await this.db
      .update(schema.areas)
      .set(data)
      .where(eq(schema.areas.id, id))
      .returning();
    await this.logAction(adminId, 'UPDATE_AREA', `Updated area #${id}`, id, ip);
    return result;
  }

  async mergeAreas(sourceId: number, targetId: number, adminId: number, reason: string, ip?: string, adminCityId?: number | null) {
    const sourceArea = await this.db.query.areas.findFirst({ where: eq(schema.areas.id, sourceId) });
    const targetArea = await this.db.query.areas.findFirst({ where: eq(schema.areas.id, targetId) });
    if (!sourceArea || !targetArea) throw new Error('Areas not found');

    if (adminCityId) {
      if (sourceArea.cityId !== adminCityId || targetArea.cityId !== adminCityId) {
        throw new Error('Unauthorized: Merges affecting multiple cities or outside your scope require Super Admin approval');
      }
    }

    // Reassign all related entities
    await this.db.update(schema.reports).set({ areaId: targetId, updatedAt: new Date() }).where(eq(schema.reports.areaId, sourceId));
    await this.db.update(schema.users).set({ areaId: targetId, updatedAt: new Date() }).where(eq(schema.users.areaId, sourceId));
    await this.db.update(schema.subscriptions).set({ areaId: targetId }).where(eq(schema.subscriptions.areaId, sourceId));

    const existingAliases = targetArea.aliases || [];
    const newAliases = [...new Set([...existingAliases, sourceArea.name])];

    await this.db.update(schema.areas).set({ isActive: false, mergedToId: targetId }).where(eq(schema.areas.id, sourceId));
    await this.db.update(schema.areas).set({ aliases: newAliases }).where(eq(schema.areas.id, targetId));

    await this.logDeepAction(adminId, 'MERGE_AREA', 'AREA', sourceId, reason, { name: sourceArea.name }, { mergedInto: targetId }, ip);
    return { success: true };
  }

  async importLocations(csvData: string, adminId: number) {
    const lines = csvData.split('\n');
    const results = { countries: 0, cities: 0, areas: 0 };

    for (const line of lines) {
      if (!line.trim()) continue;
      const [countryName, cityName, areaName] = line.split(',').map(s => s.trim());
      if (!countryName) continue;

      let cId: number;
      const existingCountry = await this.db.query.countries.findFirst({ where: eq(schema.countries.name, countryName) });
      if (existingCountry) {
        cId = existingCountry.id;
      } else {
        const [newC] = await this.db.insert(schema.countries).values({ name: countryName }).returning();
        cId = newC.id;
        results.countries++;
      }

      if (cityName) {
        let ctId: number;
        const existingCity = await this.db.query.cities.findFirst({ 
          where: and(eq(schema.cities.name, cityName), eq(schema.cities.countryId, cId)) 
        });
        if (existingCity) {
          ctId = existingCity.id;
        } else {
          const [newCt] = await this.db.insert(schema.cities).values({ name: cityName, countryId: cId }).returning();
          ctId = newCt.id;
          results.cities++;
        }

        if (areaName) {
          const existingArea = await this.db.query.areas.findFirst({
            where: and(eq(schema.areas.name, areaName), eq(schema.areas.cityId, ctId))
          });
          if (!existingArea) {
            await this.db.insert(schema.areas).values({ name: areaName, cityId: ctId });
            results.areas++;
          }
        }
      }
    }

    await this.logAction(adminId, 'IMPORT_LOCATIONS', `Imported ${results.countries} countries, ${results.cities} cities, ${results.areas} areas`);
    return results;
  }

  async disableArea(id: number, adminId: number, reason: string, ip?: string) {
    const result = await this.db.update(schema.areas).set({ isActive: false }).where(eq(schema.areas.id, id)).returning();
    await this.logDeepAction(adminId, 'DISABLE_AREA', 'AREA', id, reason, { isActive: true }, { isActive: false }, ip);
    return result;
  }


  async exportAreasToCsv(adminId: number): Promise<string> {
    const allAreas = await this.db.query.areas.findMany({
      with: { city: true },
      orderBy: [schema.areas.name],
    });

    const header = ['ID', 'Name', 'City', 'Is Active', 'Merged To ID', 'Aliases'].join(',');
    const rows = allAreas.map(a =>
      [
        a.id,
        `"${a.name}"`,
        `"${(a as any).city?.name ?? ''}"`,
        a.isActive ? 'true' : 'false',
        a.mergedToId ?? '',
        `"${(a.aliases ?? []).join('; ')}"`,
      ].join(',')
    );

    await this.logAction(adminId, 'EXPORT_AREAS_CSV', 'Exported all areas to CSV');
    return [header, ...rows].join('\n');
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
    // Fetch users based on area if provided
    let query: any = this.db.select().from(schema.users).$dynamic();
    if (areaId) {
      query = query.where(eq(schema.users.areaId, areaId));
    }
    const usersToNotify = await query;
    
    // In a real app, you'd use a background job/bulk insert
    const notifications = usersToNotify.map(user => ({
      userId: user.id,
      type: 'BROADCAST',
      message: `[OFFICIAL] ${message}`,
    }));

    if (notifications.length > 0) {
      // Chunking insert for large user bases
      const chunkSize = 100;
      for (let i = 0; i < notifications.length; i += chunkSize) {
        await this.db.insert(schema.notifications).values(notifications.slice(i, i + chunkSize));
      }
    }

    await this.logAction(adminId, 'SEND_BROADCAST', `Broadcast: ${message.substring(0, 50)}...`, areaId || 0);
    return { success: true, count: usersToNotify.length };
  }

  // --- Urgency Config ---
  async getUrgencyColors() {
    const [row] = await this.db.select().from(schema.systemSettings).where(eq(schema.systemSettings.key, 'urgency_colors')).limit(1);
    if (!row) {
      return { INFO: '#64748b', WARNING: '#f59e0b', CRITICAL: '#ef4444' }; // Defaults
    }
    return JSON.parse(row.value);
  }

  async updateUrgencyColors(adminId: number, colors: Record<string, string>) {
    await this.db
      .insert(schema.systemSettings)
      .values({ key: 'urgency_colors', value: JSON.stringify(colors), updatedAt: new Date() })
      .onConflictDoUpdate({
        target: schema.systemSettings.key,
        set: { value: JSON.stringify(colors), updatedAt: new Date() },
      });
    
    await this.logAction(adminId, 'UPDATE_URGENCY_COLORS', 'Updated system urgency color scheme');
    return { success: true };
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
    const [emergencyMode] = await this.db
      .select()
      .from(schema.systemSettings)
      .where(eq(schema.systemSettings.key, 'emergency_mode'));

    return {
      apiLatency: '42ms',
      errorRate: '0.01%',
      workerBacklog: 12,
      storageUsage: '1.2GB',
      isEmergencyMode: emergencyMode?.value === 'true',
    };
  }

  async toggleEmergencyMode(enabled: boolean, adminId: number, reason: string) {
    await this.db
      .insert(schema.systemSettings)
      .values({ key: 'emergency_mode', value: String(enabled), updatedAt: new Date() })
      .onConflictDoUpdate({
        target: schema.systemSettings.key,
        set: { value: String(enabled), updatedAt: new Date() },
      });

    await this.logAction(adminId, 'EMERGENCY_MODE_TOGGLE', `${reason} (Enabled: ${enabled})`, enabled ? 1 : 0);
    
    // Broadcast to users
    await this.notificationsService.broadcastSystemEmergency(enabled, reason);

    return { success: true, enabled };
  }

  // --- Admin Settings ---
  async getAdminSettings(adminId: number) {
    const [user] = await this.db.select().from(schema.users).where(eq(schema.users.id, adminId));
    if (!user) return null;

    return {
      account: {
        fullName: user.fullName,
        email: user.email,
        avatar: user.avatar,
        mfaEnabled: user.mfaEnabled,
      },
      notifications: typeof user.notificationSettings === 'string' 
        ? JSON.parse(user.notificationSettings) 
        : user.notificationSettings,
      moderation: typeof user.moderationPreferences === 'string' 
        ? JSON.parse(user.moderationPreferences) 
        : user.moderationPreferences,
    };
  }

  async updateAccountSettings(adminId: number, data: { fullName?: string; email?: string; avatar?: string }) {
    return this.db.update(schema.users).set(data).where(eq(schema.users.id, adminId)).returning();
  }

  async updateNotificationSettings(adminId: number, settings: any) {
    return this.db
      .update(schema.users)
      .set({ notificationSettings: JSON.stringify(settings) })
      .where(eq(schema.users.id, adminId))
      .returning();
  }

  async updateModerationSettings(adminId: number, preferences: any) {
    return this.db
      .update(schema.users)
      .set({ moderationPreferences: JSON.stringify(preferences) })
      .where(eq(schema.users.id, adminId))
      .returning();
  }

  // --- Super Admin System Settings ---
  async getSystemSettings() {
    const settings = await this.db.select().from(schema.systemSettings);
    const config: any = {};
    settings.forEach(s => {
      try {
        config[s.key] = JSON.parse(s.value);
      } catch {
        config[s.key] = s.value;
      }
    });

    return {
      emergencyMode: config.emergency_mode === 'true',
      maintenanceMode: config.maintenance_mode === 'true',
      trustConfig: config.trust_config || {
        voteWeight: 0.6,
        reporterTrustWeight: 0.3,
        ageDecayRate: 0.1
      },
    };
  }

  async updateSystemTrustConfig(adminId: number, config: any) {
    await this.db
      .insert(schema.systemSettings)
      .values({ key: 'trust_config', value: JSON.stringify(config), updatedAt: new Date() })
      .onConflictDoUpdate({
        target: schema.systemSettings.key,
        set: { value: JSON.stringify(config), updatedAt: new Date() },
      });
    
    await this.logAction(adminId, 'UPDATE_TRUST_CONFIG', 'Updated trust algorithm parameters');
    return { success: true };
  }

  async toggleMaintenanceMode(adminId: number, enabled: boolean) {
    await this.db
      .insert(schema.systemSettings)
      .values({ key: 'maintenance_mode', value: String(enabled), updatedAt: new Date() })
      .onConflictDoUpdate({
        target: schema.systemSettings.key,
        set: { value: String(enabled), updatedAt: new Date() },
      });

    await this.logAction(adminId, 'MAINTENANCE_MODE_TOGGLE', `Maintenance mode: ${enabled}`);
    return { success: true, enabled };
  }

  async restoreUser(id: number, adminId: number, reason: string, ip?: string) {
    const result = await this.db
      .update(schema.users)
      .set({ status: 'ACTIVE' as any, suspensionUntil: null, appealReceived: false })
      .where(eq(schema.users.id, id))
      .returning();
    await this.logDeepAction(adminId, 'RESTORE_USER', 'USER', id, reason, null, { status: 'ACTIVE', appealReceived: false }, ip);
    return result;
  }

  async restoreArea(id: number, adminId: number, reason: string, ip?: string) {
    const result = await this.db
      .update(schema.areas)
      .set({ isActive: true, mergedToId: null })
      .where(eq(schema.areas.id, id))
      .returning();
    await this.logDeepAction(adminId, 'RESTORE_AREA', 'AREA', id, reason, { isActive: false }, { isActive: true }, ip);
    return result;
  }

  // --- Admin Session Management ---
  async getAdminSessions(adminId: number) {
    return this.db.query.adminSessions.findMany({
      where: and(eq(schema.adminSessions.adminId, adminId), eq(schema.adminSessions.isRevoked, false)),
      orderBy: [desc(schema.adminSessions.lastActive)],
    });
  }

  async revokeSession(sessionId: number, adminId: number) {
    return this.db
      .update(schema.adminSessions)
      .set({ isRevoked: true })
      .where(and(eq(schema.adminSessions.id, sessionId), eq(schema.adminSessions.adminId, adminId)));
  }

  // --- API Key Management ---
  async getApiKeys(adminId: number) {
    return this.db.query.apiKeys.findMany({
      where: eq(schema.apiKeys.adminId, adminId),
      orderBy: [desc(schema.apiKeys.createdAt)],
    });
  }

  async createApiKey(adminId: number, name: string, permissions: string[]) {
    const key = `pk_${Math.random().toString(36).substring(2, 15)}`;
    const prefix = key.substring(0, 8);
    // In a real app, use a proper hashing library (e.g., crypto.createHash)
    const keyHash = `hashed_${key}`; 

    const result = await this.db.insert(schema.apiKeys).values({
      name,
      keyHash,
      prefix,
      adminId,
      permissions,
      createdAt: new Date(),
    }).returning();

    return { ...result[0], actualKey: key }; // Only show actual key once
  }

  async deleteApiKey(id: number, adminId: number) {
    return this.db.delete(schema.apiKeys).where(and(eq(schema.apiKeys.id, id), eq(schema.apiKeys.adminId, adminId)));
  }

  // --- Admin User Management (Super Admin) ---
  async getAdmins() {
    return this.db.query.users.findMany({
      where: inArray(schema.users.role, ['ADMIN', 'MODERATOR', 'SUPER_ADMIN']),
      with: {
        city: true,
        area: true,
      },
    });
  }

  async createAdmin(data: { email: string; fullName: string; role: any; cityId?: number; areaId?: number }, adminId: number) {
    // Note: This would typically trigger an invite email and password setup
    const [newAdmin] = await this.db.insert(schema.users).values({
      ...data,
      password: 'DEFERRED_PASSWORD_SETUP_REQUIRED', // Should be handled by invite flow
      status: 'ACTIVE',
    }).returning();

    await this.logAction(adminId, 'CREATE_ADMIN', `Created new admin: ${data.email}`, newAdmin.id);
    return newAdmin;
  }

  async switchScope(adminId: number, cityId: number | null, areaId: number | null) {
    // This allows an admin to temporarily change their operational context
    // In a real app, this might be session-only, but for focus consistency we can update the user record
    return this.db.update(schema.users).set({ cityId, areaId }).where(eq(schema.users.id, adminId)).returning();
  }


  // --- Restaurant & Food Review Management ---
  async getRestaurantsForAdmin(filters: { 
    areaId?: number; 
    cityId?: number; 
    cuisineType?: string; 
    search?: string 
  }, scope?: { cityId?: number; areaId?: number }) {
    const where: any[] = [];
    
    const finalCityId = scope?.cityId || filters.cityId;
    const finalAreaId = scope?.areaId || filters.areaId;

    if (finalCityId) where.push(eq(schema.restaurants.cityId, finalCityId));
    if (finalAreaId) where.push(eq(schema.restaurants.areaId, finalAreaId));
    if (filters.cuisineType && filters.cuisineType !== 'all') {
      where.push(ilike(schema.restaurants.cuisineType, `%${filters.cuisineType}%`));
    }
    if (filters.search) {
      where.push(ilike(schema.restaurants.name, `%${filters.search}%`));
    }

    return this.db.query.restaurants.findMany({
      where: where.length > 0 ? and(...where) : undefined,
      with: {
        city: true,
        area: true,
        reviews: {
          limit: 5,
          orderBy: [desc(schema.foodReviews.createdAt)]
        }
      },
      orderBy: [schema.restaurants.name]
    });
  }

  async createRestaurant(data: any, adminId: number) {
    const result = await this.db.insert(schema.restaurants).values({
      ...data,
      avgRating: 0,
      reviewCount: 0,
    }).returning();
    
    await this.logAction(adminId, 'CREATE_RESTAURANT', `Created restaurant: ${data.name}`, result[0].id);
    return result[0];
  }

  async updateRestaurant(id: number, data: any, adminId: number) {
    const result = await this.db.update(schema.restaurants)
      .set(data)
      .where(eq(schema.restaurants.id, id))
      .returning();
      
    await this.logAction(adminId, 'UPDATE_RESTAURANT', `Updated restaurant #${id}`, id);
    return result[0];
  }

  async deleteRestaurant(id: number, adminId: number) {
    // First delete associated reviews or handle them? 
    // Usually restaurants have reviews. The foreign key should handle this if Cascade is set, 
    // but Drizzle/Postgres might need explicit handling if not.
    // In schema.ts, it's .references(() => restaurants.id).notNull().
    
    // We'll perform a soft deletion or just delete for now as requested.
    await this.db.delete(schema.foodReviews).where(eq(schema.foodReviews.restaurantId, id));
    const result = await this.db.delete(schema.restaurants).where(eq(schema.restaurants.id, id)).returning();
    
    await this.logAction(adminId, 'DELETE_RESTAURANT', `Deleted restaurant #${id}`, id);
    return result[0];
  }

  async getFoodReviewsForAdmin(filters: {
    restaurantId?: number;
    cityId?: number;
    areaId?: number;
    userId?: number;
    minRating?: number;
    maxRating?: number;
    search?: string;
  }, scope?: { cityId?: number; areaId?: number }) {
    const { foodReviews, restaurants, users } = schema;
    const where: any[] = [];

    if (filters.restaurantId) where.push(eq(foodReviews.restaurantId, filters.restaurantId));
    if (filters.userId) where.push(eq(foodReviews.userId, filters.userId));
    if (filters.minRating) where.push(gte(foodReviews.rating, filters.minRating));
    if (filters.maxRating) where.push(lte(foodReviews.rating, filters.maxRating));
    
    if (filters.search) {
      where.push(or(
        ilike(foodReviews.title, `%${filters.search}%`),
        ilike(foodReviews.body, `%${filters.search}%`)
      ));
    }

    // Join with restaurants to enforce scoping
    const finalCityId = scope?.cityId || filters.cityId;
    const finalAreaId = scope?.areaId || filters.areaId;

    let subQuery: any = this.db.select({ id: restaurants.id }).from(restaurants);
    const subWhere: any[] = [];
    if (finalCityId) subWhere.push(eq(restaurants.cityId, finalCityId));
    if (finalAreaId) subWhere.push(eq(restaurants.areaId, finalAreaId));
    
    if (subWhere.length > 0) {
      where.push(sql`${foodReviews.restaurantId} IN (${this.db.select({ id: restaurants.id }).from(restaurants).where(and(...subWhere))})`);
    }

    return this.db.query.foodReviews.findMany({
      where: where.length > 0 ? and(...where) : undefined,
      with: {
        restaurant: true,
        user: true
      },
      orderBy: [desc(foodReviews.createdAt)],
      limit: 100
    });
  }

  async deleteFoodReview(id: number, adminId: number) {
    const review = await this.db.query.foodReviews.findFirst({
      where: eq(schema.foodReviews.id, id)
    });
    if (!review) throw new Error('Review not found');

    const result = await this.db.delete(schema.foodReviews).where(eq(schema.foodReviews.id, id)).returning();
    
    // Recalculate restaurant stats
    const restaurantId = review.restaurantId;
    const stats = await this.db
      .select({
        avgRating: avg(schema.foodReviews.rating),
        reviewCount: count(schema.foodReviews.id),
      })
      .from(schema.foodReviews)
      .where(eq(schema.foodReviews.restaurantId, restaurantId));

    await this.db
      .update(schema.restaurants)
      .set({
        avgRating: parseFloat(stats[0].avgRating ?? '0'),
        reviewCount: Number(stats[0].reviewCount),
      })
      .where(eq(schema.restaurants.id, restaurantId));

    await this.logAction(adminId, 'DELETE_FOOD_REVIEW', `Deleted review #${id} by user #${review.userId}`, id);
    return result[0];
  }

  async logDeepAction(
    adminId: number,
    action: string,
    targetType: string,
    targetId: number,
    reason: string,
    before?: any,
    after?: any,
    ip?: string,
  ) {
    this.logger.log(
      JSON.stringify({ event: 'ADMIN_ACTION', adminId, action, targetType, targetId, ip: ip ?? 'unknown', timestamp: new Date().toISOString() })
    );
    return this.db.insert(schema.adminActions).values({
      adminId,
      action,
      targetType,
      targetId,
      reason,
      beforeJson: before ? JSON.stringify(before) : null,
      afterJson: after ? JSON.stringify(after) : null,
      ip,
    });
  }

  async logAction(adminId: number, action: string, reason: string, targetId?: number, ip?: string) {
    this.logger.log(
      JSON.stringify({ event: 'ADMIN_ACTION', adminId, action, targetId, ip: ip ?? 'unknown', timestamp: new Date().toISOString() })
    );
    return this.db.insert(schema.auditLogs).values({
      adminId,
      action,
      reason,
      targetId,
      ip,
    });
  }
}
