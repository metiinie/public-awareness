import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { DRIZZLE_PROVIDER } from '../db/db.module';
import { reports, media, reactions, users, categories, areas, cities } from '../db/schema';
import { eq, and, desc, sql, SQL, lte, ne } from 'drizzle-orm';
import { CreateReportDto, FilterReportDto } from './dto/report.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ReportsService {
  constructor(
    @Inject(DRIZZLE_PROVIDER) private db: any,
    private readonly notificationsService: NotificationsService,
  ) { }

  async create(createReportDto: CreateReportDto, userId: number) {
    const { mediaUrls, ...reportData } = createReportDto;
    console.log(`[ReportsService] Creating report for user ${userId}`, { categoryId: reportData.categoryId, mediaCount: mediaUrls?.length });

    // --- Evidence Rule ---
    if (!mediaUrls || mediaUrls.length === 0) {
      throw new BadRequestException('At least one image or video is required to submit a report.');
    }

    // --- Auto Archiving Logic ---
    let archiveHours = 24;
    if (createReportDto.categoryId === 1) archiveHours = 6;

    const autoArchiveAt = new Date();
    autoArchiveAt.setHours(autoArchiveAt.getHours() + archiveHours);

    try {
      // 1. Insert report
      const [newReport] = await this.db.insert(reports).values({
        ...reportData,
        reporterId: userId,
        status: 'PENDING',
        trustScore: 50,
        autoArchiveAt: autoArchiveAt,
      }).returning();

      console.log(`[ReportsService] Inserted report ID: ${newReport.id}`);

      // 2. Insert media
      if (mediaUrls && mediaUrls.length > 0) {
        const mediaRecords = mediaUrls.map((url) => {
          const isVideo = url.toLowerCase().match(/\.(mp4|mov|avi|wmv)$/) || url.includes('video');
          return {
            reportId: newReport.id,
            url,
            type: isVideo ? 'VIDEO' : 'IMAGE',
          };
        });
        await this.db.insert(media).values(mediaRecords);
        console.log(`[ReportsService] Attached ${mediaRecords.length} media records`);
      }

      // 3. Trigger Notifications
      const fullReport = await this.findOne(newReport.id);
      try {
        await this.notificationsService.handleNewReport(fullReport);
      } catch (e) {
        console.error('[ReportsService] Notification trigger failed', e);
      }

      return fullReport;
    } catch (error) {
      console.error('[ReportsService] Create operation failed:', error);
      throw error;
    }
  }

  async findAll(filters: FilterReportDto) {
    const { categoryId, cityId, areaId, status, reporterId, sortBy = 'createdAt', order = 'desc' } = filters;

    let query = this.db.select({
      id: reports.id,
      title: reports.title,
      description: reports.description,
      status: reports.status,
      trustScore: reports.trustScore,
      createdAt: reports.createdAt,
      autoArchiveAt: reports.autoArchiveAt,
      category: { name: categories.name },
      city: { name: cities.name },
      area: { name: areas.name },
      reporter: {
        id: users.id,
        fullName: users.fullName,
        trustScore: users.trustScore,
      }
    })
    .from(reports)
    .leftJoin(categories, eq(reports.categoryId, categories.id))
    .leftJoin(cities, eq(reports.cityId, cities.id))
    .leftJoin(areas, eq(reports.areaId, areas.id))
    .leftJoin(users, eq(reports.reporterId, users.id));

    const whereClauses: any[] = [];
    
    // Default filter: Only show PENDING/VERIFIED and non-expired if not searching for something specific
    if (!status && !reporterId) {
      whereClauses.push(sql`${reports.status} IN ('PENDING', 'VERIFIED')`);
      whereClauses.push(sql`${reports.autoArchiveAt} > NOW()`);
    }

    if (categoryId) whereClauses.push(eq(reports.categoryId, categoryId));
    if (cityId) whereClauses.push(eq(reports.cityId, cityId));
    if (areaId) whereClauses.push(eq(reports.areaId, areaId));
    if (status) whereClauses.push(eq(reports.status, status as any));
    if (reporterId) whereClauses.push(eq(reports.reporterId, reporterId));

    if (whereClauses.length > 0) {
      query = query.where(and(...whereClauses));
    }

    if (sortBy === 'trustScore') {
      query = query.orderBy(order === 'desc' ? desc(reports.trustScore) : reports.trustScore);
    } else {
      query = query.orderBy(order === 'desc' ? desc(reports.createdAt) : reports.createdAt);
    }

    const results = await query;
    return results;
  }

  async findVotingHistory(userId: number) {
    const results = await this.db.select({
      id: reports.id,
      title: reports.title,
      description: reports.description,
      status: reports.status,
      trustScore: reports.trustScore,
      createdAt: reports.createdAt,
      userVote: reactions.type,
      category: { name: categories.name },
      city: { name: cities.name },
      area: { name: areas.name },
      reporter: {
        id: users.id,
        fullName: users.fullName,
        trustScore: users.trustScore,
      }
    })
    .from(reactions)
    .innerJoin(reports, eq(reactions.reportId, reports.id))
    .leftJoin(categories, eq(reports.categoryId, categories.id))
    .leftJoin(cities, eq(reports.cityId, cities.id))
    .leftJoin(areas, eq(reports.areaId, areas.id))
    .leftJoin(users, eq(reports.reporterId, users.id))
    .where(eq(reactions.userId, userId))
    .orderBy(desc(reactions.id));

    // For voting history, we need the counts for each report
    const hydrated = await Promise.all(results.map(async (r) => {
      const votes = await this.db.select().from(reactions).where(eq(reactions.reportId, r.id));
      const mediaItems = await this.db.select().from(media).where(eq(media.reportId, r.id));
      return {
        ...r,
        media: mediaItems,
        votesReal: votes.filter((v: any) => v.type === 'REAL').length,
        votesFake: votes.filter((v: any) => v.type === 'FAKE').length,
        commentCount: 0, // Simplified
      };
    }));

    return hydrated;
  }

  async findOne(id: number) {
    const [report] = await this.db.select({
      id: reports.id,
      title: reports.title,
      description: reports.description,
      status: reports.status,
      trustScore: reports.trustScore,
      createdAt: reports.createdAt,
      autoArchiveAt: reports.autoArchiveAt,
      reporterId: reports.reporterId,
      category: { name: categories.name },
      city: { name: cities.name },
      area: { name: areas.name },
      reporter: {
        id: users.id,
        fullName: users.fullName,
        trustScore: users.trustScore,
      }
    })
    .from(reports)
    .leftJoin(categories, eq(reports.categoryId, categories.id))
    .leftJoin(cities, eq(reports.cityId, cities.id))
    .leftJoin(areas, eq(reports.areaId, areas.id))
    .leftJoin(users, eq(reports.reporterId, users.id))
    .where(eq(reports.id, id))
    .limit(1);

    if (!report) throw new NotFoundException('Report not found');

    const mediaItems = await this.db.select().from(media).where(eq(media.reportId, id));
    const votes = await this.db.select().from(reactions).where(eq(reactions.reportId, id));

    const totalVotes = votes.length;
    const realVotes = votes.filter(r => r.type === 'REAL').length;
    const voteRatio = totalVotes > 0 ? (realVotes / totalVotes) * 100 : 100;

    // Age Decay
    const now = new Date();
    const createdAt = new Date(report.createdAt);
    const autoArchiveAt = new Date(report.autoArchiveAt);
    const totalLifeSpan = autoArchiveAt.getTime() - createdAt.getTime();
    const ageElapsed = Math.max(0, now.getTime() - createdAt.getTime());
    const ageDecay = Math.max(0, 1 - (ageElapsed / totalLifeSpan)) * 100;

    return {
      ...report,
      media: mediaItems,
      commentCount: 0, // Simplified for now
      votesReal: realVotes,
      votesFake: totalVotes - realVotes,
      breakdown: {
        voteRatio: Math.round(voteRatio),
        reporterTrust: report.reporter?.trustScore || 50,
        ageDecay: Math.max(0, Math.round(ageDecay)),
      }
    };
  }

  async vote(reportId: number, userId: number, type: 'REAL' | 'FAKE') {
    // Check if already voted
    const [existing] = await this.db.select().from(reactions).where(
      and(eq(reactions.reportId, reportId), eq(reactions.userId, userId))
    ).limit(1);

    if (existing) {
      if (existing.type === type) return { success: true, message: 'Already voted' };
      await this.db.update(reactions).set({ type }).where(eq(reactions.id, existing.id));
    } else {
      await this.db.insert(reactions).values({ reportId, userId, type });
    }

    // Recalculate Confidence Score and Update User Trust
    await this.updateScores(reportId);

    return { success: true };
  }

  private async updateScores(reportId: number) {
    const [report] = await this.db.select({
      id: reports.id,
      reporterId: reports.reporterId,
      createdAt: reports.createdAt,
      autoArchiveAt: reports.autoArchiveAt,
      reporterTrust: users.trustScore,
    })
    .from(reports)
    .innerJoin(users, eq(reports.reporterId, users.id))
    .where(eq(reports.id, reportId))
    .limit(1);

    if (!report) return;

    const reportVotes = await this.db.select().from(reactions).where(eq(reactions.reportId, reportId));

    // --- Confidence Score Logic ---
    // confidence = (vote_ratio * 0.5) + (reporter_trust * 0.3) + (age_decay * 0.2)

    // 1. Vote Ratio
    const realVotes = reportVotes.filter((r: any) => r.type === 'REAL').length;
    const totalVotes = reportVotes.length;
    const voteRatio = totalVotes > 0 ? realVotes / totalVotes : 1;

    // 2. Reporter Trust (normalized 0-1)
    const reporterTrust = Math.max(0, Math.min(100, report.reporterTrust)) / 100;

    // 3. Age Decay
    const now = new Date();
    const createdAt = new Date(report.createdAt);
    const autoArchiveAt = new Date(report.autoArchiveAt);
    const totalLifeSpan = autoArchiveAt.getTime() - createdAt.getTime();
    const ageElapsed = now.getTime() - createdAt.getTime();
    const ageDecay = Math.max(0, 1 - (ageElapsed / totalLifeSpan));

    const confidenceValue = (voteRatio * 0.5) + (reporterTrust * 0.3) + (ageDecay * 0.2);
    const finalConfidence = Math.round(confidenceValue * 100);

    await this.db.update(reports)
      .set({ trustScore: finalConfidence })
      .where(eq(reports.id, reportId));

    // --- Trust Score Logic ---
    // Confirmation threshold: after 5 votes, if ratio > 0.8 -> Confirmed REAL (+5)
    // if ratio < 0.2 -> Confirmed FAKE (-10)
    if (totalVotes >= 5) {
      if (voteRatio >= 0.8) {
        // Increase trust (+5) capped at 100
        await this.db.update(users)
          .set({
            trustScore: sql`LEAST(100, ${users.trustScore} + 5)`,
            updatedAt: new Date()
          })
          .where(eq(users.id, report.reporterId));

        await this.db.update(reports).set({ status: 'VERIFIED' }).where(eq(reports.id, reportId));
      } else if (voteRatio <= 0.2) {
        // Decrease trust (-10) floor at 0
        await this.db.update(users)
          .set({
            trustScore: sql`GREATEST(0, ${users.trustScore} - 10)`,
            updatedAt: new Date()
          })
          .where(eq(users.id, report.reporterId));

        await this.db.update(reports).set({ status: 'ARCHIVED' }).where(eq(reports.id, reportId));
      }
    }
  }

  async archiveExpired() {
    const now = new Date();
    const result = await this.db.update(reports)
      .set({ status: 'ARCHIVED' })
      .where(
        and(
          lte(reports.autoArchiveAt, now),
          ne(reports.status, 'ARCHIVED')
        )
      )
      .returning();

    return result.length;
  }
}

