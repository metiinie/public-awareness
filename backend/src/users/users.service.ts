import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DRIZZLE_PROVIDER } from '../db/db.module';
import { users, reports, reactions, cities, areas, savedReports, subscriptions, categories } from '../db/schema';

@Injectable()
export class UsersService {
  constructor(@Inject(DRIZZLE_PROVIDER) private db: any) {}

  async getProfile(userId: number) {
    const [user] = await this.db.select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      avatar: users.avatar,
      bio: users.bio,
      role: users.role,
      trustScore: users.trustScore,
      status: users.status,
      cityId: users.cityId,
      areaId: users.areaId,
      notificationSettings: users.notificationSettings,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Get location names
    let city = null;
    let area = null;
    if (user.cityId) {
      const [cityData] = await this.db.select().from(cities).where(eq(cities.id, user.cityId));
      city = cityData;
    }
    if (user.areaId) {
      const [areaData] = await this.db.select().from(areas).where(eq(areas.id, user.areaId));
      area = areaData;
    }

    // Statistics
    const [reportCount] = await this.db.select({ count: sql`count(*)` }).from(reports).where(eq(reports.reporterId, userId));
    const [voteCount] = await this.db.select({ count: sql`count(*)` }).from(reactions).where(eq(reactions.userId, userId));
    const [verifiedCount] = await this.db.select({ count: sql`count(*)` }).from(reports).where(
      sql`${reports.reporterId} = ${userId} AND ${reports.status} = 'VERIFIED'`
    );

    // Subscriptions details
    const userSubs = await this.db.select({
      id: subscriptions.id,
      areaId: subscriptions.areaId,
      categoryId: subscriptions.categoryId,
      areaName: areas.name,
      categoryName: categories.name,
    })
    .from(subscriptions)
    .leftJoin(areas, eq(subscriptions.areaId, areas.id))
    .leftJoin(categories, eq(subscriptions.categoryId, categories.id))
    .where(eq(subscriptions.userId, userId));

    return {
      ...user,
      location: { city, area },
      subscriptions: userSubs,
      stats: {
        reportsCreated: Number(reportCount?.count || 0),
        votesGiven: Number(voteCount?.count || 0),
        reportsVerified: Number(verifiedCount?.count || 0),
      },
      notificationSettings: typeof user.notificationSettings === 'string' 
        ? JSON.parse(user.notificationSettings) 
        : user.notificationSettings
    };
  }

  async updateProfile(userId: number, data: any) {
    const [updatedUser] = await this.db.update(users)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId))
      .returning();
    
    return updatedUser;
  }

  async getMyReports(userId: number) {
    return this.db.select().from(reports).where(eq(reports.reporterId, userId)).orderBy(sql`${reports.createdAt} DESC`);
  }

  async getMyVotes(userId: number) {
    return this.db.select({
        id: reactions.id,
        reportId: reactions.reportId,
        type: reactions.type,
        createdAt: reactions.createdAt,
        reportTitle: reports.title,
    })
    .from(reactions)
    .leftJoin(reports, eq(reactions.reportId, reports.id))
    .where(eq(reactions.userId, userId))
    .orderBy(sql`${reactions.createdAt} DESC`);
  }

  async updateNotificationSettings(userId: number, settings: any) {
    const [user] = await this.db.update(users)
      .set({
        notificationSettings: JSON.stringify(settings),
        updatedAt: new Date()
      })
      .where(eq(users.id, userId))
      .returning();
    
    return typeof user.notificationSettings === 'string' 
      ? JSON.parse(user.notificationSettings) 
      : user.notificationSettings;
  }

  async getSavedReports(userId: number) {
    return this.db.select({
        id: reports.id,
        title: reports.title,
        description: reports.description,
        status: reports.status,
        urgency: reports.urgency,
        mediaUrl: reports.mediaUrl,
        createdAt: reports.createdAt,
        saveId: savedReports.id
    })
    .from(savedReports)
    .innerJoin(reports, eq(savedReports.reportId, reports.id))
    .where(eq(savedReports.userId, userId))
    .orderBy(sql`${savedReports.createdAt} DESC`);
  }

  async toggleSavedReport(userId: number, reportId: number) {
    const [existing] = await this.db.select()
        .from(savedReports)
        .where(sql`${savedReports.userId} = ${userId} AND ${savedReports.reportId} = ${reportId}`)
        .limit(1);

    if (existing) {
        await this.db.delete(savedReports).where(eq(savedReports.id, existing.id));
        return { saved: false };
    } else {
        await this.db.insert(savedReports).values({ userId, reportId });
        return { saved: true };
    }
  }

  async addSubscription(userId: number, data: { areaId?: number, categoryId?: number }) {
    const [sub] = await this.db.insert(subscriptions).values({
        userId,
        areaId: data.areaId,
        categoryId: data.categoryId
    }).returning();
    return sub;
  }

  async removeSubscription(userId: number, subscriptionId: number) {
    await this.db.delete(subscriptions).where(sql`${subscriptions.id} = ${subscriptionId} AND ${subscriptions.userId} = ${userId}`);
    return { success: true };
  }

  async updatePushToken(userId: number, token: string | null) {
    await this.db.update(users)
      .set({ pushToken: token, updatedAt: new Date() })
      .where(eq(users.id, userId));
    return { success: true };
  }
}
