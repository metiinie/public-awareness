import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Redis } from '@upstash/redis';

export const UPSTASH_REDIS_CLIENT = 'UPSTASH_REDIS_CLIENT';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: UPSTASH_REDIS_CLIENT,
      useFactory: (config: ConfigService) => {
        return new Redis({
          url: config.get<string>('UPSTASH_REDIS_REST_URL')!,
          token: config.get<string>('UPSTASH_REDIS_REST_TOKEN')!,
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [UPSTASH_REDIS_CLIENT],
})
export class RedisModule {}
