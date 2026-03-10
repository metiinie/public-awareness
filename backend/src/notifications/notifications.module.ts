import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { SubscriptionsController } from './subscriptions.controller';

@Module({
    controllers: [NotificationsController, SubscriptionsController],
    providers: [NotificationsService],
    exports: [NotificationsService],
})
export class NotificationsModule { }
