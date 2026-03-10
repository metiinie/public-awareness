import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReportsService } from './reports.service';

@Injectable()
export class ReportsTask {
    private readonly logger = new Logger(ReportsTask.name);

    constructor(private readonly reportsService: ReportsService) { }

    @Cron(CronExpression.EVERY_HOUR)
    async handleAutoArchive() {
        this.logger.debug('Running auto-archive task...');
        try {
            const archivedCount = await this.reportsService.archiveExpired();
            if (archivedCount > 0) {
                this.logger.log(`Successfully archived ${archivedCount} expired reports.`);
            }
        } catch (error) {
            this.logger.error('Failed to run auto-archive task', error.stack);
        }
    }
}
