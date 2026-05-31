import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { UPSTASH_REDIS_CLIENT } from '../../redis/redis.module';
import { Redis } from '@upstash/redis';
import { DRIZZLE_PROVIDER } from '../../db/db.module';
import { users } from '../../db/schema';
import { eq } from 'drizzle-orm';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @Inject(UPSTASH_REDIS_CLIENT) private redis: Redis,
    @Inject(DRIZZLE_PROVIDER) private db: any,
  ) {
    const secret = configService.get<string>('JWT_SECRET');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret!,
    });
  }

  async validate(payload: any) {
    if (payload.jti) {
      const isRevoked = await this.redis.exists(`denylist:${payload.jti}`);
      if (isRevoked) {
        throw new UnauthorizedException('Token has been revoked');
      }
    }

    const [user] = await this.db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
    
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account is suspended or banned');
    }

    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
}
