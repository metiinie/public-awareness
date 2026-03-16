import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReportsTask } from './reports.task';

@Module({
  imports: [
    NotificationsModule,
  ],
  controllers: [ReportsController, CommentsController],
  providers: [ReportsService, CommentsService, ReportsTask],
})
export class ReportsModule { }

