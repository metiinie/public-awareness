import { Module } from '@nestjs/common';
import { FoodReviewsController } from './food-reviews.controller';
import { DbModule } from '../db/db.module';
import { ReportsModule } from '../reports/reports.module';

@Module({
  imports: [DbModule, ReportsModule],
  controllers: [FoodReviewsController],
})
export class FoodReviewsModule {}
