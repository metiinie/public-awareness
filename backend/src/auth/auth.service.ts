import { Injectable, UnauthorizedException, ConflictException, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { eq, sql } from 'drizzle-orm';
import { DRIZZLE_PROVIDER } from '../db/db.module';
import { users, reports, reactions } from '../db/schema';
import { LoginDto, RegisterDto, UpdateProfileDto } from './dto/auth.dto';
import { generateSecret, generateURI, verifySync } from 'otplib';
import * as qrcode from 'qrcode';
import { OAuth2Client } from 'google-auth-library';

@Injectable()
export class AuthService {
  private googleClient: OAuth2Client;

  constructor(
    @Inject(DRIZZLE_PROVIDER) private db: any,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {
    this.googleClient = new OAuth2Client(this.configService.get<string>('GOOGLE_CLIENT_ID'));
  }

  async getProfile(userId: number) {
    const [user] = await this.db.select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      avatar: users.avatar,
      role: users.role,
      trustScore: users.trustScore,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

    if (!user) {
      console.error(`[AuthService] Profile lookup failed: User ${userId} not found in DB`);
      throw new UnauthorizedException('User not found');
    }

    const [reportStats] = await this.db.select({
      count: sql`count(*)`
    }).from(reports).where(eq(reports.reporterId, userId));

    const [voteStats] = await this.db.select({
      count: sql`count(*)`
    }).from(reactions).where(eq(reactions.userId, userId));

    return {
      ...user,
      reportsSubmitted: Number(reportStats?.count || 0),
      votesCast: Number(voteStats?.count || 0),
    };
  }

  async register(registerDto: RegisterDto) {
    const email = registerDto.email.toLowerCase().trim();
    const { password, fullName } = registerDto;

    // Check if user exists
    const [existingUser] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existingUser) {
      throw new ConflictException('User already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [newUser] = await this.db.insert(users).values({
      email,
      password: hashedPassword,
      fullName,
      role: 'USER',
    }).returning();

    return this.generateToken(newUser);
  }

  async login(loginDto: LoginDto) {
    const email = loginDto.email.toLowerCase().trim();
    const { password } = loginDto;

    const [user] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.mfaEnabled) {
      const mfaPayload = { sub: user.id, mfaPending: true };
      const mfaToken = this.jwtService.sign(mfaPayload, { expiresIn: '5m' });
      return { requiresMfa: true, mfaToken };
    }

    return this.generateToken(user);
  }

  async googleLogin(idToken: string) {
    let ticket;
    try {
      ticket = await this.googleClient.verifyIdToken({
        idToken,
        // Optional: specify audience if needed: audience: this.configService.get<string>('GOOGLE_CLIENT_ID'),
      });
    } catch (error) {
      console.error('Google ID token verification failed:', error);
      throw new UnauthorizedException('Invalid Google ID token');
    }

    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      throw new UnauthorizedException('Invalid Google payload');
    }

    const email = payload.email.toLowerCase().trim();
    const googleId = payload.sub;
    const fullName = payload.name || payload.given_name || 'Google User';
    const avatar = payload.picture;

    // Check if user exists by googleId
    let [user] = await this.db.select().from(users).where(eq(users.googleId, googleId)).limit(1);

    if (!user) {
      // Check if user exists by email
      [user] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);

      if (user) {
        // Link googleId to existing user
        [user] = await this.db.update(users)
          .set({ googleId, provider: 'GOOGLE' })
          .where(eq(users.id, user.id))
          .returning();
      } else {
        // Create new user
        [user] = await this.db.insert(users).values({
          email,
          fullName,
          avatar,
          provider: 'GOOGLE',
          googleId,
          role: 'USER',
        }).returning();
      }
    }

    return this.generateToken(user);
  }

  async updateProfile(userId: number, updateDto: UpdateProfileDto) {
    const [updatedUser] = await this.db.update(users)
      .set({
        ...updateDto,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId))
      .returning();

    return this.generateToken(updatedUser);
  }

  async generateMfaSecret(userId: number, email: string) {
    const secret = generateSecret();
    const otpauthUrl = generateURI({ issuer: 'CivicWatch', label: email, secret });

    await this.db.update(users).set({ mfaSecret: secret }).where(eq(users.id, userId));

    const qrCodeDataUrl = await qrcode.toDataURL(otpauthUrl);
    return {
      secret,
      qrCodeUrl: qrCodeDataUrl
    };
  }

  async activateMfa(userId: number, code: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user || !user.mfaSecret) {
      throw new UnauthorizedException('MFA not set up');
    }

    let isValid = false;
    try {
      isValid = verifySync({ token: code, secret: user.mfaSecret }).valid;
    } catch (e) {
      isValid = false;
    }
    if (!isValid) {
      throw new UnauthorizedException('Invalid MFA code');
    }

    await this.db.update(users).set({ mfaEnabled: true }).where(eq(users.id, userId));
    return { success: true, message: 'MFA activated successfully' };
  }

  async verifyMfa(mfaToken: string, code: string) {
    try {
      const decoded = this.jwtService.verify(mfaToken);
      if (!decoded.mfaPending) {
        throw new UnauthorizedException('Invalid token type');
      }

      const [user] = await this.db.select().from(users).where(eq(users.id, decoded.sub)).limit(1);
      if (!user || !user.mfaEnabled || !user.mfaSecret) {
        throw new UnauthorizedException('MFA not enabled for this user');
      }

      let isValid = false;
      try {
        isValid = verifySync({ token: code, secret: user.mfaSecret }).valid;
      } catch (e) {
        isValid = false;
      }
      if (!isValid) {
        throw new UnauthorizedException('Invalid MFA code');
      }

      return this.generateToken(user);
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired MFA token');
    }
  }

  generateToken(user: any) {
    const payload = { 
      sub: user.id, 
      email: user.email, 
      role: user.role,
      cityId: user.cityId,
      areaId: user.areaId
    };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        cityId: user.cityId,
        areaId: user.areaId,
      },
    };
  }
}
