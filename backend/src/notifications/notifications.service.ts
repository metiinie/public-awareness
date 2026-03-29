import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DRIZZLE_PROVIDER } from '../db/db.module';
import { notifications, subscriptions, users, reports, areas, cities, categories } from '../db/schema';
import { eq, and, or, sql, isNull, desc, lt } from 'drizzle-orm';
import { NotificationsGateway } from './notifications.gateway';
import Expo, { ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';

@Injectable()
export class NotificationsService {
    private readonly logger = new Logger(NotificationsService.name);
    private expo: Expo;

    constructor(
        @Inject(DRIZZLE_PROVIDER) private db: any,
        private notificationsGateway: NotificationsGateway
    ) {
        this.expo = new Expo({ useFcmV1: true });
    }

    // ─── Helper: Send native push to multiple user IDs ────────────────────────
    private async sendPushToUsers(
        userIds: number[],
        payload: { title: string; body: string; data?: object },
    ) {
        if (userIds.length === 0) return;

        // Fetch all push tokens for these users in one query
        const userRows = await this.db
            .select({ id: users.id, pushToken: users.pushToken })
            .from(users)
            .where(sql`${users.id} = ANY(ARRAY[${sql.join(userIds.map(id => sql`${id}`), sql`, `)}]::int[])`);

        const messages: ExpoPushMessage[] = [];
        const tokenToUserId = new Map<string, number>();

        for (const row of userRows) {
            const token = row.pushToken;
            if (!token || !Expo.isExpoPushToken(token)) continue;
            tokenToUserId.set(token, row.id);
            messages.push({
                to: token,
                sound: 'default',
                title: payload.title,
                body: payload.body,
                data: payload.data ?? {},
                priority: 'high',
                channelId: 'alerts', // Android 8+ notification channel
            });
        }

        if (messages.length === 0) return;

        // Chunk according to Expo's 100-message limit and send
        const chunks = this.expo.chunkPushNotifications(messages);
        const tickets: ExpoPushTicket[] = [];

        for (const chunk of chunks) {
            try {
                const result = await this.expo.sendPushNotificationsAsync(chunk);
                tickets.push(...result);
            } catch (err) {
                this.logger.error('[Push] Failed to send chunk', err);
            }
        }

        // Clean up stale (DeviceNotRegistered) tokens so we don't try them again
        for (let i = 0; i < tickets.length; i++) {
            const ticket = tickets[i];
            if (ticket.status === 'error') {
                this.logger.warn(`[Push] Ticket error: ${ticket.message}`);
                if ((ticket.details as any)?.error === 'DeviceNotRegistered') {
                    const staleToken = messages[i]?.to as string;
                    const staleUserId = tokenToUserId.get(staleToken);
                    if (staleUserId) {
                        await this.db
                            .update(users)
                            .set({ pushToken: null })
                            .where(eq(users.id, staleUserId));
                        this.logger.log(`[Push] Cleared stale token for user ${staleUserId}`);
                    }
                }
            }
        }
    }

    // ─── Handle new report: notify all subscribed users ───────────────────────
    async handleNewReport(report: any) {
        const matches = await this.db
            .select()
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

        const isCritical = report.urgency === 'CRITICAL';
        const newNotifications = matches
            .filter((sub: any) => sub.userId !== report.reporterId) // Don't notify the reporter themselves
            .map((sub: any) => ({
                userId: sub.userId,
                reportId: report.id,
                type: isCritical ? 'CRITICAL_ALERT' : 'NEW_REPORT',
                message: isCritical
                    ? `🚨 CRITICAL ALERT: ${report.title} reported in ${report.area?.name || 'your area'}!`
                    : `⚠️ New ${report.category?.name || 'issue'} reported in ${report.area?.name || 'your area'}.`,
                isRead: false,
            }));

        if (newNotifications.length === 0) return;

        await this.db.insert(notifications).values(newNotifications);

        // Real-time WebSocket (for users with the app open)
        newNotifications.forEach((n: any) => {
            this.notificationsGateway.notifyUser(n.userId, n);
        });

        // Native OS push (for users with the app closed/backgrounded)
        const recipientIds = newNotifications.map((n: any) => n.userId);
        await this.sendPushToUsers(recipientIds, {
            title: isCritical ? '🚨 Critical Alert' : '⚠️ New Report',
            body: isCritical
                ? `CRITICAL: ${report.title} in ${report.area?.name || 'your area'}`
                : `New ${report.category?.name || 'report'} in ${report.area?.name || 'your area'}`,
            data: { reportId: report.id, type: isCritical ? 'CRITICAL_ALERT' : 'NEW_REPORT' },
        });
    }

    // ─── Handle status change: notify the report's author ────────────────────
    async handleStatusChange(report: any, newStatus: string) {
        if (!report || !report.reporterId) return;

        const messages: Record<string, string> = {
            VERIFIED: `✅ Your report "${report.title || 'issue'}" has been verified by the community!`,
            REMOVED: `❌ Your report "${report.title || 'issue'}" has been removed due to community feedback.`,
            UNDER_REVIEW: `⚠️ Your report "${report.title || 'issue'}" is currently under review.`,
        };
        const pushTitles: Record<string, string> = {
            VERIFIED: '✅ Report Verified',
            REMOVED: '❌ Report Removed',
            UNDER_REVIEW: '⚠️ Report Under Review',
        };

        const message = messages[newStatus];
        if (!message) return;

        const newNotif = {
            userId: report.reporterId,
            reportId: report.id,
            type: 'STATUS_CHANGE',
            message,
            isRead: false,
        };

        await this.db.insert(notifications).values(newNotif);

        // Real-time WebSocket
        this.notificationsGateway.notifyUser(report.reporterId, newNotif);

        // Native OS push
        await this.sendPushToUsers([report.reporterId], {
            title: pushTitles[newStatus] || 'Report Update',
            body: message,
            data: { reportId: report.id, type: 'STATUS_CHANGE' },
        });
    }

    // ─── Paginated notification feed for a user ───────────────────────────────
    async findAllForUser(userId: number, limit = 20, cursor?: number) {
        const query = this.db
            .select({
                id: notifications.id,
                userId: notifications.userId,
                reportId: notifications.reportId,
                type: notifications.type,
                message: notifications.message,
                isRead: notifications.isRead,
                createdAt: notifications.createdAt,
                report: {
                    id: reports.id,
                    confidenceScore: reports.confidenceScore,
                    area: { name: areas.name },
                    city: { name: cities.name },
                },
            })
            .from(notifications)
            .leftJoin(reports, eq(notifications.reportId, reports.id))
            .leftJoin(areas, eq(reports.areaId, areas.id))
            .leftJoin(cities, eq(reports.cityId, cities.id))
            .where(
                cursor
                    ? and(eq(notifications.userId, userId), lt(notifications.id, cursor))
                    : eq(notifications.userId, userId)
            )
            .orderBy(desc(notifications.id))
            .limit(limit + 1); // fetch one extra to know if there's a next page

        const items = await query;
        let nextCursor: number | undefined;

        if (items.length > limit) {
            const nextItem = items.pop();
            nextCursor = nextItem.id;
        }

        return { items, nextCursor };
    }

    async markAsRead(id: number, userId: number) {
        await this.db
            .update(notifications)
            .set({ isRead: true })
            .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
        return { success: true };
    }

    // ─── Subscription helpers ─────────────────────────────────────────────────
    async subscribe(userId: number, areaId: number, categoryId?: number) {
        const [existing] = await this.db
            .select()
            .from(subscriptions)
            .where(
                and(
                    eq(subscriptions.userId, userId),
                    eq(subscriptions.areaId, areaId),
                    categoryId
                        ? eq(subscriptions.categoryId, categoryId)
                        : isNull(subscriptions.categoryId)
                )
            );

        if (existing) return existing;

        const [newSub] = await this.db
            .insert(subscriptions)
            .values({ userId, areaId, categoryId })
            .returning();

        return newSub;
    }

    async unsubscribe(userId: number, subscriptionId: number) {
        await this.db
            .delete(subscriptions)
            .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.userId, userId)));
        return { success: true };
    }

    async getSubscriptions(userId: number) {
        return this.db
            .select({
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

    // ─── Daily cleanup cron ───────────────────────────────────────────────────
    @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
    async cleanupOldNotifications() {
        const now = new Date();
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(now.getDate() - 7);
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(now.getDate() - 30);

        try {
            const readDeleted = await this.db
                .delete(notifications)
                .where(and(eq(notifications.isRead, true), lt(notifications.createdAt, sevenDaysAgo)))
                .returning({ id: notifications.id });

            const unreadDeleted = await this.db
                .delete(notifications)
                .where(and(eq(notifications.isRead, false), lt(notifications.createdAt, thirtyDaysAgo)))
                .returning({ id: notifications.id });

            this.logger.log(`[Cleanup] Removed ${readDeleted.length} read notifications older than 7 days.`);
            this.logger.log(`[Cleanup] Removed ${unreadDeleted.length} unread notifications older than 30 days.`);
        } catch (error) {
            this.logger.error('Failed to cleanup old notifications', error);
        }
    }
}
