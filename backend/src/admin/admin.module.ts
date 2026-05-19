import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { DbModule } from '../db/db.module';
import { ScopeGuard } from '../auth/guards/scope.guard';
import { AdminRateLimitGuard } from '../auth/guards/admin-rate-limit.guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DbModule, NotificationsModule, AuthModule],
  controllers: [AdminController],
  providers: [AdminService, ScopeGuard, AdminRateLimitGuard],
})
export class AdminModule {}
