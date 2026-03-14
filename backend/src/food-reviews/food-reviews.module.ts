import { Module } from '@nestjs/common';
import { FoodReviewsController } from './food-reviews.controller';
import { DbModule } from '../db/db.module';

@Module({
  imports: [DbModule],
  controllers: [FoodReviewsController],
})
export class FoodReviewsModule {}
