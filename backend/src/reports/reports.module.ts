import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { CommentsController } from './comments.controller';
import { BullModule } from '@nestjs/bullmq';
import { MediaProcessor } from './media.processor';
import { CommentsService } from './comments.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReportsTask } from './reports.task';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'media',
    }),
    NotificationsModule,
  ],
  controllers: [ReportsController, CommentsController],
  providers: [ReportsService, MediaProcessor, CommentsService, ReportsTask],
})
export class ReportsModule { }
