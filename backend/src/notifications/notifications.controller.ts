import { Controller, Get, Patch, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
    constructor(private readonly notificationsService: NotificationsService) { }

    @Get()
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get all notifications for the current user' })
    findAll(@Request() req) {
        try {
            return this.notificationsService.findAllForUser(req.user.userId);
        } catch (error) {
            console.error('Error fetching notifications for user:', req.user.userId, error);
            throw error;
        }
    }

    @Patch(':id/read')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Mark a notification as read' })
    markAsRead(@Param('id') id: string, @Request() req) {
        try {
            return this.notificationsService.markAsRead(+id, req.user.userId);
        } catch (error) {
            console.error('Error marking notification as read:', id, error);
            throw error;
        }
    }
}
