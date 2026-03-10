import { Injectable, Inject } from '@nestjs/common';
import { DRIZZLE_PROVIDER } from '../db/db.module';
import { notifications, subscriptions, users, reports, areas, cities, categories } from '../db/schema';
import { eq, and, or, sql, isNull, desc } from 'drizzle-orm';

@Injectable()
export class NotificationsService {
    constructor(@Inject(DRIZZLE_PROVIDER) private db: any) { }

    async handleNewReport(report: any) {
        // Find users subscribed to this area and either all categories or this specific category
        const matches = await this.db.select()
            .from(subscriptions)
            .where(
                and(
                    eq(subscriptions.areaId, report.areaId),
                    or(
                        eq(subscriptions.categoryId, report.categoryId),
                        sql`${subscriptions.categoryId} IS NULL`
                    )
                )
            );

        if (matches.length === 0) return;

        // Create notifications for all matched users
        const newNotifications = matches
            .filter((sub: any) => sub.userId !== report.reporterId) // Don't notify the reporter themselves
            .map((sub: any) => ({
                userId: sub.userId,
                reportId: report.id,
                type: 'NEW_REPORT',
                message: `⚠️ New ${report.category?.name || 'issue'} reported in ${report.area?.name || 'your area'}.`,
                isRead: false,
            }));

        if (newNotifications.length > 0) {
            await this.db.insert(notifications).values(newNotifications);
        }
    }

    async findAllForUser(userId: number) {
        return this.db.select({
            id: notifications.id,
            userId: notifications.userId,
            reportId: notifications.reportId,
            type: notifications.type,
            message: notifications.message,
            isRead: notifications.isRead,
            createdAt: notifications.createdAt,
            report: {
                id: reports.id,
                trustScore: reports.trustScore,
                area: { name: areas.name },
                city: { name: cities.name },
            }
        })
        .from(notifications)
        .leftJoin(reports, eq(notifications.reportId, reports.id))
        .leftJoin(areas, eq(reports.areaId, areas.id))
        .leftJoin(cities, eq(reports.cityId, cities.id))
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.createdAt));
    }

    async markAsRead(id: number, userId: number) {
        await this.db.update(notifications)
            .set({ isRead: true })
            .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
        return { success: true };
    }

    // --- Subscriptions ---
    async subscribe(userId: number, areaId: number, categoryId?: number) {
        const [existing] = await this.db.select()
            .from(subscriptions)
            .where(
                and(
                    eq(subscriptions.userId, userId),
                    eq(subscriptions.areaId, areaId),
                    categoryId ? eq(subscriptions.categoryId, categoryId) : isNull(subscriptions.categoryId)
                )
            );

        if (existing) return existing;

        const [newSub] = await this.db.insert(subscriptions).values({
            userId,
            areaId,
            categoryId,
        }).returning();

        return newSub;
    }

    async unsubscribe(userId: number, subscriptionId: number) {
        await this.db.delete(subscriptions)
            .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.userId, userId)));
        return { success: true };
    }

    async getSubscriptions(userId: number) {
        return this.db.select({
            id: subscriptions.id,
            areaId: subscriptions.areaId,
            categoryId: subscriptions.categoryId,
            area: { name: areas.name },
            category: { name: categories.name },
        })
        .from(subscriptions)
        .leftJoin(areas, eq(subscriptions.areaId, areas.id))
        .leftJoin(categories, eq(subscriptions.categoryId, categories.id))
        .where(eq(subscriptions.userId, userId));
    }
}
