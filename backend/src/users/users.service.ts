import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DRIZZLE_PROVIDER } from '../db/db.module';
import { users, reports, reactions, cities, areas } from '../db/schema';

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

    return {
      ...user,
      location: { city, area },
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
}
