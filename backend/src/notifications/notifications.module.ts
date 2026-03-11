import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { SubscriptionsController } from './subscriptions.controller';
import { NotificationsGateway } from './notifications.gateway';

@Module({
    controllers: [NotificationsController, SubscriptionsController],
    providers: [NotificationsService, NotificationsGateway],
    exports: [NotificationsService],
})
export class NotificationsModule { }
