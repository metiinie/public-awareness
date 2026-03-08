import { Module } from '@nestjs/common';
import { MetaController } from './meta.controller';

@Module({
  controllers: [MetaController],
  exports: [MetaModule],
})
export class MetaModule {}
