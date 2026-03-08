import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { BullModule } from '@nestjs/bullmq';
import { MediaProcessor } from './media.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'media',
    }),
  ],
  controllers: [ReportsController],
  providers: [ReportsService, MediaProcessor],
})
export class ReportsModule {}
