import { Controller, Get, Post, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { CreateReportDto, FilterReportDto } from './dto/report.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) { }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new report' })
  create(@Body() createReportDto: CreateReportDto, @Request() req) {
    console.log(`[ReportsController] POST /reports hit by user ${req.user.userId}`);
    return this.reportsService.create(createReportDto, req.user.userId);
  }

  @Get()

  @UseGuards(JwtAuthGuard) // Optional context but helpful for votes if logged in
  @ApiOperation({ summary: 'Get all reports with filters' })
  findAll(@Query() filters: FilterReportDto, @Request() req) {
    return this.reportsService.findAll({ ...filters, viewerId: req.user?.userId });
  }

  @Get('user/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user reports' })
  getMyReports(@Request() req) {
    return this.reportsService.findAll({ reporterId: req.user.userId });
  }

  @Get('user/subscribed')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get reports the current user is subscribed to' })
  getSubscribedReports(@Request() req, @Query() filters: FilterReportDto) {
    return this.reportsService.getSubscribedReports(req.user.userId, { ...filters, viewerId: req.user.userId });
  }

  @Get('user/votes')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user voting history' })
  getMyVotes(@Request() req) {
    return this.reportsService.findVotingHistory(req.user.userId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard) // Adding guard to ensure user context for voting status
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a single report by ID' })
  findOne(@Param('id') id: string, @Request() req) {
    return this.reportsService.findOne(+id, req.user?.userId);
  }

  @Post(':id/vote')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Vote REAL, FAKE, or LIKE on a report' })
  vote(@Param('id') id: string, @Body('type') type: 'REAL' | 'FAKE' | 'LIKE', @Request() req) {
    return this.reportsService.vote(+id, req.user.userId, type);
  }

  @Post(':id/save')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle save status of a report' })
  toggleSave(@Param('id') id: string, @Request() req) {
    return this.reportsService.toggleSave(+id, req.user.userId);
  }

  @Post(':id/comments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Post a comment on a report' })
  postComment(@Param('id') id: string, @Body('content') content: string, @Request() req) {
    return this.reportsService.createComment(+id, req.user.userId, content);
  }

  @Post(':id/flag')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Flag a report for moderation' })
  flagReport(@Param('id') id: string, @Body('reason') reason: string, @Request() req) {
    return this.reportsService.flagReport(+id, req.user.userId, reason);
  }

  @Post(':id/comments/:commentId/flag')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Flag a comment for moderation' })
  flagComment(@Param('id') id: string, @Param('commentId') commentId: string, @Body('reason') reason: string, @Request() req) {
    return this.reportsService.flagComment(+id, +commentId, req.user.userId, reason);
  }
}
