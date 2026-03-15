import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SCOPE_KEY, ScopeEntity } from '../decorators/scoped.decorator';
import { DRIZZLE_PROVIDER } from '../../db/db.module';
import { eq } from 'drizzle-orm';
import * as schema from '../../db/schema';

/**
 * ScopeGuard enforces that an ADMIN can only act on entities
 * within their assigned cityId / areaId.
 * SUPER_ADMINs always bypass this check.
 *
 * Pair with `@Scoped('REPORT' | 'USER' | 'AREA')` decorator.
 */
@Injectable()
export class ScopeGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @Inject(DRIZZLE_PROVIDER) private db: any,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const entity = this.reflector.getAllAndOverride<ScopeEntity>(SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!entity) return true; // no scoping required

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) return false;
    if (user.role === 'SUPER_ADMIN') return true; // bypass

    const targetId = parseInt(request.params?.id, 10);
    if (!targetId || isNaN(targetId)) return true; // no id param, skip

    const adminCityId: number | undefined = user.cityId;
    if (!adminCityId) return true; // admin has no scope restriction set

    let entityCityId: number | null = null;

    if (entity === 'REPORT') {
      const [row] = await this.db
        .select({ cityId: schema.reports.cityId })
        .from(schema.reports)
        .where(eq(schema.reports.id, targetId))
        .limit(1);
      entityCityId = row?.cityId ?? null;
    } else if (entity === 'USER') {
      // For user actions, check their reports' city OR their own assigned city
      const [row] = await this.db
        .select({ cityId: schema.users.cityId })
        .from(schema.users)
        .where(eq(schema.users.id, targetId))
        .limit(1);
      // If the target user has no city assigned, allow (it's a fresh user)
      if (!row?.cityId) return true;
      entityCityId = row?.cityId ?? null;
    } else if (entity === 'AREA') {
      const [row] = await this.db
        .select({ cityId: schema.areas.cityId })
        .from(schema.areas)
        .where(eq(schema.areas.id, targetId))
        .limit(1);
      entityCityId = row?.cityId ?? null;
    }

    if (entityCityId !== null && entityCityId !== adminCityId) {
      console.error(`[ScopeGuard] Forbidden: entityCityId (${entityCityId}) !== adminCityId (${adminCityId}) for targetId ${targetId} entity ${entity}`);
      throw new ForbiddenException(
        'You do not have permission to act on entities outside your assigned scope.',
      );
    }

    console.log(`[ScopeGuard] Allowed: entityCityId (${entityCityId}) === adminCityId (${adminCityId}) for targetId ${targetId} entity ${entity}`);
    return true;
  }
}

