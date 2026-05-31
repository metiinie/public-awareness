import { Controller, Post, Body, HttpCode, HttpStatus, Get, UseGuards, Request, Patch, Query, BadRequestException, Logger } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto, UpdateProfileDto, MfaCodeDto } from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  constructor(private readonly authService: AuthService) { }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully.' })
  getProfile(@Request() req) {
    try {
      return this.authService.getProfile(req.user.userId);
    } catch (error) {
      this.logger.error(`Error fetching profile for user: ${req.user.userId}`, error);
      throw error;
    }
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User successfully registered.' })
  @ApiResponse({ status: 409, description: 'User already exists.' })
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'User login' })
  @ApiResponse({ status: 200, description: 'Successfully logged in.' })
  @ApiResponse({ status: 401, description: 'Invalid credentials.' })
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'User logout' })
  @ApiResponse({ status: 200, description: 'Successfully logged out.' })
  logout(@Request() req) {
    // req.headers.authorization should exist because of JwtAuthGuard
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      return this.authService.logout(token);
    }
    return { success: true };
  }

  @Get('verify-email')
  @ApiOperation({ summary: 'Verify email address' })
  @ApiResponse({ status: 200, description: 'Email verified successfully.' })
  @ApiResponse({ status: 401, description: 'Invalid or expired token.' })
  verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Google Single Sign-On' })
  @ApiResponse({ status: 200, description: 'Successfully logged in with Google.' })
  @ApiResponse({ status: 401, description: 'Invalid Google ID token.' })
  googleLogin(@Body() body: { idToken: string }) {
    if (!body.idToken) {
      throw new BadRequestException('idToken is required');
    }
    return this.authService.googleLogin(body.idToken);
  }

  @Patch('profile')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully.' })
  updateProfile(@Request() req, @Body() updateProfileDto: UpdateProfileDto) {
    try {
      return this.authService.updateProfile(req.user.userId, updateProfileDto);
    } catch (error) {
      this.logger.error(`Error updating profile for user: ${req.user.userId}`, error);
      throw error;
    }
  }

  @Post('mfa/setup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate MFA QR code and secret' })
  @ApiResponse({ status: 200, description: 'MFA setup initialized.' })
  setupMfa(@Request() req) {
    return this.authService.generateMfaSecret(req.user.userId, req.user.email);
  }

  @Post('mfa/activate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Activate MFA using a code' })
  @ApiResponse({ status: 200, description: 'MFA successfully activated.' })
  activateMfa(@Request() req, @Body() mfaDto: MfaCodeDto) {
    return this.authService.activateMfa(req.user.userId, mfaDto.code);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify MFA during login' })
  @ApiResponse({ status: 200, description: 'Successfully verified.' })
  @ApiResponse({ status: 401, description: 'Invalid token or code.' })
  verifyMfa(@Body() mfaDto: MfaCodeDto) {
    if (!mfaDto.mfaToken) {
      throw new BadRequestException('mfaToken is required for verification');
    }
    return this.authService.verifyMfa(mfaDto.mfaToken, mfaDto.code);
  }
}
