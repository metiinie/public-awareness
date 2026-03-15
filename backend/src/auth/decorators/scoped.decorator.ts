import { SetMetadata } from '@nestjs/common';

export const SCOPE_KEY = 'scope_entity';
export type ScopeEntity = 'REPORT' | 'USER' | 'AREA';

/** Mark an endpoint as requiring scope-level access, i.e. the admin must
 *  own the city/area that the target entity belongs to.
 *  Super Admins bypass this check automatically.
 */
export const Scoped = (entity: ScopeEntity) => SetMetadata(SCOPE_KEY, entity);
