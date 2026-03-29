import { Controller, Get, Patch, Post, Delete, Body, UseGuards, Req, Param, ParseIntPipe } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {
    console.log('[UsersController] Initialized');
  }

  @Get('profile')
  getProfile(@Req() req: any) {
    return this.usersService.getProfile(req.user.userId);
  }

  @Patch('profile')
  updateProfile(@Req() req: any, @Body() data: any) {
    return this.usersService.updateProfile(req.user.userId, data);
  }

  @Get('my-reports')
  getMyReports(@Req() req: any) {
    return this.usersService.getMyReports(req.user.userId);
  }

  @Get('my-votes')
  getMyVotes(@Req() req: any) {
    return this.usersService.getMyVotes(req.user.userId);
  }

  @Patch('notification-settings')
  updateNotificationSettings(@Req() req: any, @Body() settings: any) {
    return this.usersService.updateNotificationSettings(req.user.userId, settings);
  }
  
  @Get('saved-reports')
  getSavedReports(@Req() req: any) {
    return this.usersService.getSavedReports(req.user.userId);
  }

  @Post('saved-reports/toggle')
  toggleSavedReport(@Req() req: any, @Body('reportId', ParseIntPipe) reportId: number) {
    return this.usersService.toggleSavedReport(req.user.userId, reportId);
  }
}
