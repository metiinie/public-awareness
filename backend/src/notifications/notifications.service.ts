import { Injectable, Inject } from '@nestjs/common';
import { DRIZZLE_PROVIDER } from '../db/db.module';
import { notifications, subscriptions, users } from '../db/schema';
import { eq, and, or, sql, isNull } from 'drizzle-orm';

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
        return this.db.query.notifications.findMany({
            where: eq(notifications.userId, userId),
            with: {
                report: {
                    with: {
                        category: true,
                        area: true,
                    }
                },
            },
            orderBy: [sql`${notifications.createdAt} DESC`],
        });
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
        return this.db.query.subscriptions.findMany({
            where: eq(subscriptions.userId, userId),
            with: {
                area: true,
                category: true,
            }
        });
    }
}
