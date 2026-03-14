import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DRIZZLE_PROVIDER } from '../db/db.module';
import { notifications, subscriptions, users, reports, areas, cities, categories } from '../db/schema';
import { eq, and, or, sql, isNull, desc, lt } from 'drizzle-orm';
import { NotificationsGateway } from './notifications.gateway';
@Injectable()
export class NotificationsService {
    private readonly logger = new Logger(NotificationsService.name);

    constructor(
        @Inject(DRIZZLE_PROVIDER) private db: any,
        private notificationsGateway: NotificationsGateway
    ) { }

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
            .map((sub: any) => {
                const isCritical = report.urgency === 'CRITICAL';
                return {
                    userId: sub.userId,
                    reportId: report.id,
                    type: isCritical ? 'CRITICAL_ALERT' : 'NEW_REPORT',
                    message: isCritical 
                        ? `🚨 CRITICAL ALERT: ${report.title} reported in ${report.area?.name || 'your area'}!`
                        : `⚠️ New ${report.category?.name || 'issue'} reported in ${report.area?.name || 'your area'}.`,
                    isRead: false,
                };
            });

        if (newNotifications.length > 0) {
            await this.db.insert(notifications).values(newNotifications);
            
            // Emit real-time events to connected users
            newNotifications.forEach((n: any) => {
                this.notificationsGateway.notifyUser(n.userId, n);
            });
        }
    }

    async handleStatusChange(report: any, newStatus: string) {
        if (!report || !report.reporterId) return;

        let message = '';
        if (newStatus === 'VERIFIED') {
            message = `✅ Your report "${report.title || 'issue'}" has been verified by the community!`;
        } else if (newStatus === 'REMOVED') {
            message = `❌ Your report "${report.title || 'issue'}" has been removed due to community feedback.`;
        } else if (newStatus === 'UNDER_REVIEW') {
            message = `⚠️ Your report "${report.title || 'issue'}" is currently under review.`;
        } else {
            return;
        }

        const newNotif = {
            userId: report.reporterId,
            reportId: report.id,
            type: 'STATUS_CHANGE',
            message,
            isRead: false,
        };

        await this.db.insert(notifications).values(newNotif);
        
        // Emit real-time event to the connected user
        this.notificationsGateway.notifyUser(report.reporterId, newNotif);
    }

    async findAllForUser(userId: number, limit: number = 20, cursor?: number) {
        let query = this.db.select({
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
        .where(cursor ? and(eq(notifications.userId, userId), lt(notifications.id, cursor)) : eq(notifications.userId, userId))
        .orderBy(desc(notifications.id))
        .limit(limit + 1); // Fetch one extra to determine if there's a next page

        const items = await query;
        let nextCursor: number | undefined = undefined;

        if (items.length > limit) {
            const nextItem = items.pop(); // Remove the extra item
            nextCursor = nextItem.id;
        }

        return {
            items,
            nextCursor
        };
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
    @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
    async cleanupOldNotifications() {
        const now = new Date();
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(now.getDate() - 7);

        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(now.getDate() - 30);

        try {
            // Delete read notifications older than 7 days
            const readDeleted = await this.db.delete(notifications)
                .where(and(eq(notifications.isRead, true), lt(notifications.createdAt, sevenDaysAgo)))
                .returning({ id: notifications.id });

            // Delete unread notifications older than 30 days
            const unreadDeleted = await this.db.delete(notifications)
                .where(and(eq(notifications.isRead, false), lt(notifications.createdAt, thirtyDaysAgo)))
                .returning({ id: notifications.id });

            this.logger.log(`[Cleanup] Removed ${readDeleted.length} read notifications older than 7 days.`);
            this.logger.log(`[Cleanup] Removed ${unreadDeleted.length} unread notifications older than 30 days.`);
        } catch (error) {
            this.logger.error('Failed to cleanup old notifications', error);
        }
    }
}
