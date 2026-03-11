import { Controller, Get, Patch, Param, UseGuards, Request, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
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
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'cursor', required: false, type: Number })
    findAll(
        @Request() req,
        @Query('limit') limit?: string,
        @Query('cursor') cursor?: string,
    ) {
        try {
            const parsedLimit = limit ? parseInt(limit, 10) : 20;
            const parsedCursor = cursor ? parseInt(cursor, 10) : undefined;
            return this.notificationsService.findAllForUser(req.user.userId, parsedLimit, parsedCursor);
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
