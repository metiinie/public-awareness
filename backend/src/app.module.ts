import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DbModule } from './db/db.module';
import { AuthModule } from './auth/auth.module';
import { ReportsModule } from './reports/reports.module';
import { MetaModule } from './meta/meta.module';
import { RolesGuard } from './auth/guards/roles.guard';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { UploadModule } from './upload/upload.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ScheduleModule } from '@nestjs/schedule';
import { RestaurantsModule } from './restaurants/restaurants.module';
import { FoodReviewsModule } from './food-reviews/food-reviews.module';
import { NestModule, MiddlewareConsumer } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { LoggerMiddleware } from './common/middleware/logger.middleware';
import { UsersModule } from './users/users.module';
import { EmergencyModeGuard } from './auth/guards/emergency-mode.guard';
import { RedisModule } from './redis/redis.module';




import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    WinstonModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isProd = config.get('NODE_ENV') === 'production';
        const transports: winston.transport[] = [
          new winston.transports.Console({
            format: isProd 
              ? winston.format.json()
              : winston.format.combine(
                  winston.format.timestamp(),
                  winston.format.colorize(),
                  winston.format.simple(),
                ),
          }),
        ];

        if (!isProd) {
          transports.push(
            new winston.transports.File({
              filename: 'logs/error.log',
              level: 'error',
            }),
            new winston.transports.File({ filename: 'logs/combined.log' }),
          );
        }

        return { transports };
      },
    }),
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 60, // 60 requests per minute
    }]),
    ScheduleModule.forRoot(),
    RedisModule,
    DbModule,
    AuthModule,
    ReportsModule,
    MetaModule,
    UploadModule,
    NotificationsModule,
    RestaurantsModule,
    FoodReviewsModule,
    AdminModule,
    UsersModule,
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'),
      serveRoot: '/uploads',
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: EmergencyModeGuard,
    },
  ],
})

export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*');
  }
}
