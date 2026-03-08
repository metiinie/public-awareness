import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { DRIZZLE_PROVIDER } from '../db/db.module';
import { reports, media, reactions, users } from '../db/schema';
import { eq, and, desc, sql, SQL } from 'drizzle-orm';
import { CreateReportDto, FilterReportDto } from './dto/report.dto';

@Injectable()
export class ReportsService {
  constructor(@Inject(DRIZZLE_PROVIDER) private db: any) { }

  async create(createReportDto: CreateReportDto, userId: number) {
    const { mediaUrls, ...reportData } = createReportDto;

    // --- Evidence Rule ---
    if (!mediaUrls || mediaUrls.length === 0) {
      throw new BadRequestException('At least one image or video is required to submit a report.');
    }

    // --- Auto Archiving Logic ---
    // Example: Traffic -> 6h, Power -> 24h, Water -> 24h
    // Assuming category IDs 1=Traffic, 2=Power, 3=Water, 4=Security, 5=Other
    let archiveHours = 24;
    if (createReportDto.categoryId === 1) archiveHours = 6;

    const autoArchiveAt = new Date();
    autoArchiveAt.setHours(autoArchiveAt.getHours() + archiveHours);

    // Create report
    const [newReport] = await this.db.insert(reports).values({
      ...reportData,
      reporterId: userId,
      status: 'PENDING',
      trustScore: 50, // Initial confidence score
      autoArchiveAt: autoArchiveAt,
    }).returning();

    // Insert media
    await this.db.insert(media).values(
      mediaUrls.map((url) => ({
        reportId: newReport.id,
        url,
        type: 'IMAGE',
      })),
    );

    return newReport;
  }

  async findAll(filters: FilterReportDto) {
    const conditions: SQL[] = [
      // Only show PENDING or VERIFIED reports that haven't expired
      sql`${reports.status} IN ('PENDING', 'VERIFIED')`,
      sql`${reports.autoArchiveAt} > NOW()`,
    ];

    if (filters.categoryId) conditions.push(eq(reports.categoryId, filters.categoryId));
    if (filters.cityId) conditions.push(eq(reports.cityId, filters.cityId));
    if (filters.areaId) conditions.push(eq(reports.areaId, filters.areaId));
    if (filters.status) conditions.push(eq(reports.status, filters.status as any));

    return this.db.query.reports.findMany({
      where: and(...conditions),
      with: {
        media: true,
        category: true,
        city: true,
        area: true,
        reporter: {
          columns: {
            id: true,
            fullName: true,
            trustScore: true,
          },
        },
      },
      // --- Feed Ranking Logic ---
      // 1. Confidence score (trustScore field) DESC
      // 2. Recency (createdAt field) DESC
      orderBy: [desc(reports.trustScore), desc(reports.createdAt)],
    });
  }

  async findOne(id: number) {
    const report = await this.db.query.reports.findFirst({
      where: eq(reports.id, id),
      with: {
        media: true,
        category: true,
        city: true,
        area: true,
        reporter: true,
        reactions: true,
      },
    });

    if (!report) throw new NotFoundException('Report not found');
    return report;
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
    const report = await this.db.query.reports.findFirst({
      where: eq(reports.id, reportId),
      with: {
        reporter: true,
        reactions: true,
      },
    });

    if (!report) return;

    // --- Confidence Score Logic ---
    // confidence = (vote_ratio * 0.5) + (reporter_trust * 0.3) + (age_decay * 0.2)

    // 1. Vote Ratio
    const realVotes = report.reactions.filter((r: any) => r.type === 'REAL').length;
    const totalVotes = report.reactions.length;
    const voteRatio = totalVotes > 0 ? realVotes / totalVotes : 1;

    // 2. Reporter Trust (normalized 0-1)
    const reporterTrust = Math.max(0, Math.min(100, report.reporter.trustScore)) / 100;

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
}

