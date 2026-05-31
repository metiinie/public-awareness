import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export const DRIZZLE_PROVIDER = 'DRIZZLE_PROVIDER';

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE_PROVIDER,
      useFactory: (configService: ConfigService) => {
        const queryClient = postgres(configService.get<string>('DATABASE_URL')!, {
          max: 20,               // Maximum connections in pool
          idle_timeout: 20,      // Close idle connections after 20s
          connect_timeout: 10,   // Timeout connecting after 10s
        });
        return drizzle(queryClient, { schema });
      },
      inject: [ConfigService],
    },
  ],
  exports: [DRIZZLE_PROVIDER],
})
export class DbModule {}
