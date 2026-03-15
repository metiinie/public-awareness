import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
} from '@nestjs/common';
import { DRIZZLE_PROVIDER } from '../../db/db.module';
import * as schema from '../../db/schema';

const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_DESTRUCTIVE = 15;       // max destructive actions per window

/**
 * AdminRateLimitGuard prevents a single admin from performing mass-destructive
 * actions (REMOVE, BAN, MERGE, DISABLE) faster than MAX_DESTRUCTIVE per 5 min.
 * Breaches are persisted to auditLogs as RATE_LIMIT_BREACH.
 */
@Injectable()
export class AdminRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(AdminRateLimitGuard.name);
  // Map of adminId -> array of timestamps for destructive actions
  private readonly windows = new Map<number, number[]>();

  constructor(@Inject(DRIZZLE_PROVIDER) private db: any) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) return false;

    const adminId: number = user.userId ?? user.id;
    const now = Date.now();

    // Prune timestamps outside the window
    const timestamps = (this.windows.get(adminId) ?? []).filter(
      (t) => now - t < WINDOW_MS,
    );
    timestamps.push(now);
    this.windows.set(adminId, timestamps);

    if (timestamps.length > MAX_DESTRUCTIVE) {
      const ip: string =
        request.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ??
        request.ip ??
        'unknown';

      this.logger.warn(
        JSON.stringify({
          event: 'RATE_LIMIT_BREACH',
          adminId,
          ip,
          count: timestamps.length,
          window: `${WINDOW_MS / 1000}s`,
          timestamp: new Date().toISOString(),
        }),
      );

      // Persist audit trail entry for the breach
      try {
        await this.db.insert(schema.auditLogs).values({
          adminId,
          action: 'RATE_LIMIT_BREACH',
          reason: `Exceeded ${MAX_DESTRUCTIVE} destructive actions in ${WINDOW_MS / 60000} minutes`,
          ip,
        });
      } catch (_) {
        // Non-blocking — don't prevent the 429 from being returned
      }

      throw new HttpException(
        {
          statusCode: 429,
          message:
            'Too many destructive actions. Please wait before continuing. A review flag has been logged.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
