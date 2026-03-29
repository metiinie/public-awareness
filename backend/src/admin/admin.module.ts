import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { DbModule } from '../db/db.module';
import { ScopeGuard } from '../auth/guards/scope.guard';
import { AdminRateLimitGuard } from '../auth/guards/admin-rate-limit.guard';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [DbModule, NotificationsModule],
  controllers: [AdminController],
  providers: [AdminService, ScopeGuard, AdminRateLimitGuard],
})
export class AdminModule {}
