import { Injectable, UnauthorizedException, ConflictException, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { eq, sql } from 'drizzle-orm';
import { DRIZZLE_PROVIDER } from '../db/db.module';
import { users, reports, reactions } from '../db/schema';
import { LoginDto, RegisterDto, UpdateProfileDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE_PROVIDER) private db: any,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {
    console.log('[AuthService] Initialized with secret length:', this.configService.get('JWT_SECRET')?.length || 0);
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

    return updatedUser;
  }

  private generateToken(user: any) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    };
  }
}
