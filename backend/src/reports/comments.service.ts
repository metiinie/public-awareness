import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { DRIZZLE_PROVIDER } from '../db/db.module';
import { comments, reports, users } from '../db/schema';
import { eq, desc, and } from 'drizzle-orm';

@Injectable()
export class CommentsService {
    constructor(@Inject(DRIZZLE_PROVIDER) private db: any) { }

    async create(reportId: number, userId: number, content: string) {
        // Verify report exists
        const report = await this.db.query.reports.findFirst({
            where: eq(reports.id, reportId),
        });

        if (!report) {
            throw new NotFoundException('Report not found');
        }

        const [newComment] = await this.db.insert(comments).values({
            reportId,
            userId,
            content,
        }).returning();

        return newComment;
    }

    async findByReportId(reportId: number) {
        return this.db.query.comments.findMany({
            where: eq(comments.reportId, reportId),
            with: {
                user: {
                    columns: {
                        id: true,
                        fullName: true,
                        trustScore: true,
                    },
                },
            },
            orderBy: [desc(comments.createdAt)],
        });
    }

    async remove(id: number, userId: number) {
        const [result] = await this.db.delete(comments)
            .where(and(eq(comments.id, id), eq(comments.userId, userId)))
            .returning();

        if (!result) throw new NotFoundException('Comment not found or unauthorized');
        return { success: true };
    }
}
