import { Controller, Get, Post, Body, Param, UseGuards, Request, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CommentsService } from './comments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('comments')
@Controller('reports/:reportId/comments')
export class CommentsController {
    constructor(private readonly commentsService: CommentsService) { }

    @Post()
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Post a comment on a report' })
    create(
        @Param('reportId') reportId: string,
        @Body('content') content: string,
        @Request() req,
    ) {
        return this.commentsService.create(+reportId, req.user.userId, content);
    }

    @Get()
    @ApiOperation({ summary: 'Get all comments for a report' })
    findAll(@Param('reportId') reportId: string) {
        return this.commentsService.findByReportId(+reportId);
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Delete a comment' })
    remove(@Param('id') id: string, @Request() req) {
        return this.commentsService.remove(+id, req.user.userId);
    }
}
