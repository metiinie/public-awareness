import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Inject } from '@nestjs/common';
import { DRIZZLE_PROVIDER } from '../../db/db.module';
import * as schema from '../../db/schema';
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';

@Injectable()
export class EmergencyModeGuard implements CanActivate {
  constructor(
    @Inject(DRIZZLE_PROVIDER)
    private db: PostgresJsDatabase<typeof schema>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    // SAFE methods are always allowed (GET, HEAD, OPTIONS)
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      return true;
    }

    // Admins and Managers might be allowed to bypass emergency mode for resolution
    const user = request.user;
    if (user && ['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      return true;
    }

    // Check emergency mode in database
    const [setting] = await this.db
      .select()
      .from(schema.systemSettings)
      .where(eq(schema.systemSettings.key, 'emergency_mode'));

    if (setting && setting.value === 'true') {
      throw new ForbiddenException('System is in Emergency Mode. Mutations are temporarily disabled.');
    }

    return true;
  }
}
