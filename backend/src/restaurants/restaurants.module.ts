import { Module } from '@nestjs/common';
import { RestaurantsController } from './restaurants.controller';
import { DbModule } from '../db/db.module';

@Module({
  imports: [DbModule],
  controllers: [RestaurantsController],
})
export class RestaurantsModule {}
