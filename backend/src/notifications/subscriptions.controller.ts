import { Controller, Get, Post, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('subscriptions')
@Controller('subscriptions')
export class SubscriptionsController {
    constructor(private readonly notificationsService: NotificationsService) { }

    @Get()
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get all subscriptions for the current user' })
    findAll(@Request() req) {
        return this.notificationsService.getSubscriptions(req.user.userId);
    }

    @Post()
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Subscribe to an area and optional category' })
    subscribe(
        @Body('areaId') areaId: number,
        @Body('categoryId') categoryId: number | undefined,
        @Request() req
    ) {
        return this.notificationsService.subscribe(req.user.userId, areaId, categoryId);
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Unsubscribe' })
    unsubscribe(@Param('id') id: string, @Request() req) {
        return this.notificationsService.unsubscribe(req.user.userId, +id);
    }
}
