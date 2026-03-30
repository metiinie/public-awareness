import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { DRIZZLE_PROVIDER } from '../db/db.module';
import { reports, media, reactions, users, categories, areas, cities, comments, moderationReports, foodReviews, restaurants, savedReports, systemSettings } from '../db/schema';
import { eq, and, or, desc, sql, SQL, lte, ne, lt } from 'drizzle-orm';
import { CreateReportDto, FilterReportDto } from './dto/report.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ReportsService {
  constructor(
    @Inject(DRIZZLE_PROVIDER) private db: any,
    private readonly notificationsService: NotificationsService,
  ) { }

  async create(createReportDto: CreateReportDto, userId: number) {
    const { mediaUrls, restaurantId, rating, latitude, longitude, ...reportData } = createReportDto;

    // --- Evidence Rule ---
    if (!mediaUrls || mediaUrls.length === 0) {
      throw new BadRequestException('At least one image or video is required to submit a report.');
    }

    // --- PlaceName Logic for Food Reviews ---
    let finalPlaceName = reportData.placeName || null;
    if (restaurantId) {
      const [rest] = await this.db.select().from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1);
      if (rest) {
        finalPlaceName = rest.name;
      }
    }

    // --- Auto Archiving Logic ---
    let archiveHours = 24;
    if (createReportDto.categoryId === 1) archiveHours = 6;

    const autoArchiveAt = new Date();
    autoArchiveAt.setHours(autoArchiveAt.getHours() + archiveHours);

    // --- Trust & Urgency Rules ---
    const [userRecord] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    const userTrust = userRecord?.trustScore ?? 50;
    
    // --- Profanity Check ---
    const forbiddenWords = ['badword1', 'badword2', 'spam', 'fakeinfo'];
    const hasProfanity = forbiddenWords.some(word => 
      (reportData.title || '').toLowerCase().includes(word) || 
      (reportData.description || '').toLowerCase().includes(word)
    );

    let initialStatus = 'REPORTED';
    if (reportData.urgency === 'CRITICAL' || userTrust < 20 || hasProfanity) {
      initialStatus = 'UNDER_REVIEW';
    }

    let initialReportTrust = 50;
    if (userTrust > 80) initialReportTrust = 70;
    else if (userTrust < 30) initialReportTrust = 30;

    try {
      console.log('[ReportsService] Inserting report with data:', JSON.stringify(reportData));
      // 1. Insert report
      const [newReport] = await this.db.insert(reports).values({
        ...reportData,
        description: reportData.description || '',
        reporterId: userId,
        status: initialStatus,
        urgency: reportData.urgency || 'INFO',
        placeName: finalPlaceName,
        confidenceScore: initialReportTrust,
        latitude: latitude,
        longitude: longitude,
        autoArchiveAt: autoArchiveAt,
      }).returning();

      console.log('[ReportsService] Report inserted, ID:', newReport?.id);

      if (initialStatus === 'UNDER_REVIEW') {
        this.notificationsService.handleStatusChange(newReport, 'UNDER_REVIEW').catch(e => console.error('[ReportsService] Under-review notification failed', e));
      }

      // 2. Insert media
      if (mediaUrls && mediaUrls.length > 0) {
        const mediaRecords = mediaUrls
          .filter(url => typeof url === 'string')
          .map((url) => {
            const isVideo = url.toLowerCase().match(/\.(mp4|mov|avi|wmv)$/) || url.includes('video');
            return {
              reportId: newReport.id,
              url,
              type: isVideo ? 'VIDEO' : 'IMAGE',
            };
          });
        
        if (mediaRecords.length > 0) {
          await this.db.insert(media).values(mediaRecords);
        }
      }

      // 2.5 Insert Food Review if applicable
      if (restaurantId && rating) {
        await this.db.insert(foodReviews).values({
          restaurantId,
          userId,
          rating,
          title: reportData.title,
          body: reportData.description || undefined,
          mediaUrls: mediaUrls || [],
        });

        // Update restaurant averages
        const existingReviews = await this.db.select().from(foodReviews).where(eq(foodReviews.restaurantId, restaurantId));
        const currentCount = existingReviews.length;
        const sumRating = existingReviews.reduce((acc: any, review: any) => acc + review.rating, 0);
        const newAvg = currentCount > 0 ? (sumRating / currentCount) : rating;

        await this.db.update(restaurants)
          .set({
            avgRating: newAvg,
            reviewCount: currentCount,
          })
          .where(eq(restaurants.id, restaurantId));
      }

      // 3. Trigger Notifications
      const fullReport = await this.findOne(newReport.id);
      try {
        await this.notificationsService.handleNewReport(fullReport);
        // Also broadcast for real-time feed updates
        this.notificationsService.broadcastNewReport(fullReport);
      } catch (e) {
        console.error('[ReportsService] Notification trigger failed:', e.message);
      }

      return fullReport;
    } catch (error) {
      console.error('[ReportsService] CRITICAL FAILURE in create():', error);
      if (error.stack) console.error(error.stack);
      throw error;
    }
  }

  async findAll(filters: FilterReportDto) {
    const { categoryId, cityId, areaId, status, reporterId, sortBy = 'createdAt', order = 'desc' } = filters;

    let query = this.db.select(this.getReportSelect(filters.viewerId))
    .from(reports);
    
    query = this.applyReportJoins(query);

    const whereClauses: any[] = [];
    
    // Default filter: Only show PUBLISHED/VERIFIED and non-expired if not searching for something specific
    // EXCEPT: Always show reports to their own author (viewerId === reporterId)
    if (!status && !reporterId) {
      const globalVisibility = and(
        ne(reports.status, 'REMOVED'),
        or(
          sql`${reports.status} IN ('REPORTED', 'VERIFIED') AND ${reports.autoArchiveAt} > NOW()`,
          filters.viewerId ? eq(reports.reporterId, filters.viewerId) : sql`FALSE`
        )
      );
      whereClauses.push(globalVisibility);
    }


    if (categoryId) whereClauses.push(eq(reports.categoryId, categoryId));
    if (cityId) whereClauses.push(eq(reports.cityId, cityId));
    if (areaId) whereClauses.push(eq(reports.areaId, areaId));
    if (status) whereClauses.push(eq(reports.status, status as any));

    if (filters.urgency) whereClauses.push(eq(reports.urgency, filters.urgency as any));
    if (filters.search) {
      whereClauses.push(or(
        sql`${reports.title} ILIKE ${'%' + filters.search + '%'}`,
        sql`${reports.description} ILIKE ${'%' + filters.search + '%'}`,
        sql`${reports.placeName} ILIKE ${'%' + filters.search + '%'}`
      ));
    }
    if (reporterId) whereClauses.push(eq(reports.reporterId, reporterId));

    if (filters.cursor) {
      whereClauses.push(lt(reports.id, filters.cursor));
    }

    if (whereClauses.length > 0) {
      query = query.where(and(...whereClauses));
    }

    const sortField = sortBy || 'createdAt';
    const sortOrder = order || 'desc';

    switch (sortField) {
      case 'confidenceScore':
        query = query.orderBy(sortOrder === 'desc' ? desc(reports.confidenceScore) : reports.confidenceScore);
        break;
      case 'urgency':
        // Custom urgency ordering: CRITICAL > WARNING > INFO
        query = query.orderBy(sortOrder === 'desc' ? 
          sql`CASE WHEN ${reports.urgency} = 'CRITICAL' THEN 3 WHEN ${reports.urgency} = 'WARNING' THEN 2 ELSE 1 END DESC` : 
          sql`CASE WHEN ${reports.urgency} = 'CRITICAL' THEN 3 WHEN ${reports.urgency} = 'WARNING' THEN 2 ELSE 1 END ASC`
        );
        break;
      case 'votes':
        // Trending Algorithm: (Actual Votes - Fake Votes) / (Hours + 2)^1.8
        query = query.orderBy(sortOrder === 'desc' ? 
          desc(sql`((SELECT count(*) FROM reactions WHERE report_id = ${reports.id} AND type = 'REAL') - (SELECT count(*) FROM reactions WHERE report_id = ${reports.id} AND type = 'FAKE')) / pow((extract(epoch from (now() - ${reports.createdAt}))/3600) + 2, 1.8)`) : 
          sql`((SELECT count(*) FROM reactions WHERE report_id = ${reports.id} AND type = 'REAL') - (SELECT count(*) FROM reactions WHERE report_id = ${reports.id} AND type = 'FAKE')) / pow((extract(epoch from (now() - ${reports.createdAt}))/3600) + 2, 1.8)`
        );
        break;
      default:
        query = query.orderBy(sortOrder === 'desc' ? desc(reports.createdAt) : reports.createdAt);
    }

    if (filters.limit) {
      query = query.limit(filters.limit);
    } else {
      query = query.limit(20);
    }

    const results = await query;
    
    // Hydrate media for each report
    const hydrated = await Promise.all(results.map(async (r: any) => {
      const mediaItems = await this.db.select().from(media).where(eq(media.reportId, r.id));
      return {
        ...r,
        media: mediaItems,
      };
    }));

    return hydrated;
  }

  async findVotingHistory(userId: number) {
    const results = await this.db.select({
      id: reports.id,
      title: reports.title,
      description: reports.description,
      status: reports.status,
      confidenceScore: reports.confidenceScore,
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

  async findOne(id: number, userId?: number) {
    let query = this.db.select(this.getReportSelect(userId))
    .from(reports);
    
    query = this.applyReportJoins(query);
    
    console.log('[ReportsService] Finding report with ID:', id);
    const [report] = await query.where(eq(reports.id, id)).limit(1);

    if (!report) {
       console.warn('[ReportsService] Report not found:', id);
       throw new NotFoundException('Report not found');
    }
    console.log('[ReportsService] Report found:', report.id);

    const mediaItems = await this.db.select().from(media).where(eq(media.reportId, id));
    const votes = await this.db.select().from(reactions).where(eq(reactions.reportId, id));
    
    const totalVotes = votes.length;
    const realVotes = votes.filter(r => r.type === 'REAL').length;
    const voteRatio = totalVotes > 0 ? (realVotes / totalVotes) * 100 : 100;

    // Age Decay
    const now = new Date();
    const createdAt = new Date(report.createdAt);
    const autoArchiveAt = new Date(report.autoArchiveAt);
    const totalLifeSpan = Math.max(1, autoArchiveAt.getTime() - createdAt.getTime());
    const ageElapsed = Math.max(0, now.getTime() - createdAt.getTime());
    const ageDecay = Math.max(0, 1 - (ageElapsed / totalLifeSpan)) * 100;

    const allComments = await this.db.select({
      id: comments.id,
      content: comments.content,
      createdAt: comments.createdAt,
      user: {
        id: users.id,
        fullName: users.fullName,
      }
    })
    .from(comments)
    .leftJoin(users, eq(comments.userId, users.id))
    .where(eq(comments.reportId, id))
    .orderBy(desc(comments.id));
    
    const userVote = userId ? votes.find(v => v.userId === userId)?.type : null;
    
    return {
      ...report,
      media: mediaItems,
      comments: allComments,
      commentCount: allComments.length,
      votesReal: realVotes,
      votesFake: totalVotes - realVotes,
      userVote: userVote,
      breakdown: {
        voteRatio: Math.round(voteRatio),
        reporterTrust: report.reporter?.trustScore || 50,
        ageDecay: Math.max(0, Math.round(ageDecay)),
      }
    };
  }

  async vote(reportId: number, userId: number, type: 'REAL' | 'FAKE' | 'LIKE') {
    // Check if already voted
    const [existing] = await this.db.select().from(reactions).where(
      and(eq(reactions.reportId, reportId), eq(reactions.userId, userId))
    ).limit(1);

    if (existing) {
      if (existing.type === type) {
        // Toggle Off
        await this.db.delete(reactions).where(eq(reactions.id, existing.id));
      } else {
        // Switch Vote
        await this.db.update(reactions).set({ type }).where(eq(reactions.id, existing.id));
      }
    } else {
      await this.db.insert(reactions).values({ reportId, userId, type });
    }

    // Recalculate Confidence Score and Update User Trust (only for REAL/FAKE votes)
    if (type !== 'LIKE') {
      await this.updateScores(reportId);
    }

    return { success: true };
  }

  async toggleSave(reportId: number, userId: number) {
    const [existing] = await this.db.select().from(savedReports).where(
      and(eq(savedReports.reportId, reportId), eq(savedReports.userId, userId))
    ).limit(1);

    if (existing) {
      await this.db.delete(savedReports).where(eq(savedReports.id, existing.id));
      return { saved: false };
    } else {
      await this.db.insert(savedReports).values({ reportId, userId });
      return { saved: true };
    }
  }

  private async updateScores(reportId: number) {
    const [report] = await this.db.select({
      id: reports.id,
      title: reports.title,
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

    // --- Dynamic Confidence Score Logic ---
    // Default weights
    let weights = { voteWeight: 0.5, reporterTrustWeight: 0.3, ageDecayRate: 0.2 };
    
    try {
      const [configRow] = await this.db.select().from(sql`system_settings`).where(sql`key = 'trust_config'`).limit(1);
      if (configRow?.value) {
        const customWeights = JSON.parse(configRow.value);
        weights = { ...weights, ...customWeights };
      }
    } catch (e) {
      console.error('[ReportsService] Failed to fetch trust weights, using defaults', e);
    }

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
    const totalLifeSpan = Math.max(1, autoArchiveAt.getTime() - createdAt.getTime());
    const ageElapsed = now.getTime() - createdAt.getTime();
    const ageDecay = Math.max(0, 1 - (ageElapsed / totalLifeSpan));

    const confidenceValue = (voteRatio * weights.voteWeight) + 
                          (reporterTrust * weights.reporterTrustWeight) + 
                          (ageDecay * weights.ageDecayRate);
    const finalConfidence = Math.round(confidenceValue * 100);

    await this.db.update(reports)
      .set({ confidenceScore: finalConfidence })
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
        this.notificationsService.handleStatusChange(report, 'VERIFIED').catch(e => console.error('[ReportsService] Status change notification failed', e));
      } else if (voteRatio <= 0.2) {
        // Decrease trust (-10) floor at 0
        await this.db.update(users)
          .set({
            trustScore: sql`GREATEST(0, ${users.trustScore} - 10)`,
            updatedAt: new Date()
          })
          .where(eq(users.id, report.reporterId));

        await this.db.update(reports).set({ status: 'REMOVED' }).where(eq(reports.id, reportId));
        this.notificationsService.handleStatusChange(report, 'REMOVED').catch(e => console.error('[ReportsService] Status change notification failed', e));
      }
    }
  }

  async getSubscribedReports(userId: number, filters?: FilterReportDto) {
    const userSubscriptions = await this.notificationsService.getSubscriptions(userId);
    
    if (userSubscriptions.length === 0) {
      return { items: [], nextCursor: undefined }; // No subscriptions, return nothing
    }

    let query = this.db.select(this.getReportSelect(filters?.viewerId))
    .from(reports);
    
    query = this.applyReportJoins(query);

    const whereClauses: any[] = [];
    
    // Build subscription OR conditions
    // Each subscription matches by area AND (specific category OR any category)
    const subscriptionConditions = userSubscriptions.map(sub => {
      if (sub.categoryId) {
        return and(eq(reports.areaId, sub.areaId), eq(reports.categoryId, sub.categoryId));
      } else {
        return eq(reports.areaId, sub.areaId); // matches any category in this area
      }
    });

    const subFilter = or(...subscriptionConditions);
    
    // Visibility rules for subscribed feed:
    // 1. Must match subscription conditions
    // 2. Must NOT be REMOVED
    // 3. AND (is PUBLISHED/VERIFIED/non-expired OR is CRITICAL OR is the viewer themselves)
    
    const visibilityConditions = and(
      ne(reports.status, 'REMOVED'),
      or(
        sql`${reports.status} IN ('REPORTED', 'VERIFIED') AND ${reports.autoArchiveAt} > NOW()`,
        eq(reports.urgency, 'CRITICAL'),
        filters?.viewerId ? eq(reports.reporterId, filters.viewerId) : sql`FALSE`
      )
    );

    whereClauses.push(and(subFilter, visibilityConditions));

    // Pagination using cursor
    const limit = filters?.limit || 20;
    if (filters?.cursor) {
      whereClauses.push(lt(reports.id, filters.cursor));
    }

    if (whereClauses.length > 0) {
      query = query.where(and(...whereClauses));
    }

    query = query.orderBy(desc(reports.id)).limit(limit + 1); // Fetch one extra to determine if there's a next page

    const results = await query;
    let nextCursor: number | undefined;

    if (results.length > limit) {
      const nextItem = results.pop(); // Remove the extra item
      nextCursor = nextItem.id;
    }
    
    // Hydrate media
    const hydratedItems = await Promise.all(results.map(async (r: any) => {
      const mediaItems = await this.db.select().from(media).where(eq(media.reportId, r.id));
      return {
        ...r,
        media: mediaItems,
      };
    }));

    return { items: hydratedItems, nextCursor };
  }

  async expireOldReports() {
    const now = new Date();
    const result = await this.db.update(reports)
      .set({ status: 'REMOVED' })
      .where(
        and(
          lte(reports.autoArchiveAt, now),
          ne(reports.status, 'REMOVED'),
          ne(reports.status, 'VERIFIED')
        )
      )
      .returning();

    return result.length;
  }

  async createComment(reportId: number, userId: number, content: string) {
    if (!content || content.trim().length === 0) {
      throw new BadRequestException('Comment content cannot be empty');
    }

    const [comment] = await this.db.insert(comments).values({
      reportId: reportId,
      userId: userId,
      content: content,
    }).returning();

    // Re-fetch with user info
    const [fullComment] = await this.db.select({
      id: comments.id,
      content: comments.content,
      createdAt: comments.createdAt,
      user: {
        id: users.id,
        fullName: users.fullName,
      }
    })
    .from(comments)
    .leftJoin(users, eq(comments.userId, users.id))
    .where(eq(comments.id, comment.id));

    return fullComment;
  }

  async flagReport(reportId: number, reporterId: number, reason: string) {
    if (!reason || reason.trim().length === 0) {
      throw new BadRequestException('Reason is required to flag a report');
    }

    // Check if the report exists
    const [report] = await this.db.select().from(reports).where(eq(reports.id, reportId)).limit(1);
    if (!report) {
      throw new NotFoundException('Report not found');
    }

    const [flag] = await this.db.insert(moderationReports).values({
      reportId: reportId,
      reporterId: reporterId,
      reason: reason,
      status: 'PENDING'
    }).returning();

    return flag;
  }

  async flagComment(reportId: number, commentId: number, reporterId: number, reason: string) {
    if (!reason || reason.trim().length === 0) {
      throw new BadRequestException('Reason is required to flag a comment');
    }

    // Check if the comment exists and belongs to the report
    const [comment] = await this.db.select().from(comments).where(
      and(eq(comments.id, commentId), eq(comments.reportId, reportId))
    ).limit(1);
    
    if (!comment) {
      throw new NotFoundException('Comment not found on this report');
    }

    const [flag] = await this.db.insert(moderationReports).values({
      reportId: reportId,
      commentId: commentId,
      reporterId: reporterId,
      reason: reason,
      status: 'PENDING'
    }).returning();

    return flag;
  }

  private getReportSelect(viewerId?: number) {
    return {
      id: reports.id,
      title: reports.title,
      description: reports.description,
      status: reports.status,
      urgency: reports.urgency,
      placeName: reports.placeName,
      confidenceScore: reports.confidenceScore,
      createdAt: reports.createdAt,
      autoArchiveAt: reports.autoArchiveAt,
      categoryId: reports.categoryId,
      cityId: reports.cityId,
      areaId: reports.areaId,
      category: { name: categories.name },
      city: { name: cities.name },
      area: { name: areas.name },
      reporter: {
        id: users.id,
        fullName: users.fullName,
        trustScore: users.trustScore,
      },
      votesReal: sql<number>`(SELECT count(*)::int FROM reactions WHERE reactions.report_id = ${reports.id} AND reactions.type = 'REAL')`,
      votesFake: sql<number>`(SELECT count(*)::int FROM reactions WHERE reactions.report_id = ${reports.id} AND reactions.type = 'FAKE')`,
      likeCount: sql<number>`(SELECT count(*)::int FROM reactions WHERE reactions.report_id = ${reports.id} AND reactions.type = 'LIKE')`,
      commentCount: sql<number>`(SELECT count(*)::int FROM comments WHERE comments.report_id = ${reports.id})`,
      userVote: viewerId ? sql<string | null>`(SELECT reactions.type FROM reactions WHERE reactions.report_id = ${reports.id} AND reactions.user_id = ${viewerId} AND (reactions.type = 'REAL' OR reactions.type = 'FAKE') LIMIT 1)` : sql`NULL`,
      userLiked: viewerId ? sql<boolean>`EXISTS(SELECT 1 FROM reactions WHERE reactions.report_id = ${reports.id} AND reactions.user_id = ${viewerId} AND reactions.type = 'LIKE')` : sql`FALSE`,
      userSaved: viewerId ? sql<boolean>`EXISTS(SELECT 1 FROM saved_reports WHERE saved_reports.report_id = ${reports.id} AND saved_reports.user_id = ${viewerId})` : sql`FALSE`,
    };
  }

  private applyReportJoins(query: any) {
    return query
      .leftJoin(categories, eq(reports.categoryId, categories.id))
      .leftJoin(cities, eq(reports.cityId, cities.id))
      .leftJoin(areas, eq(reports.areaId, areas.id))
      .leftJoin(users, eq(reports.reporterId, users.id));
  }
}

