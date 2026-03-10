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
  @ApiOperation({ summary: 'Get all reports with filters' })
  findAll(@Query() filters: FilterReportDto) {
    return this.reportsService.findAll(filters);
  }

  @Get('user/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user reports' })
  getMyReports(@Request() req) {
    return this.reportsService.findAll({ reporterId: req.user.userId });
  }

  @Get('user/votes')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user voting history' })
  getMyVotes(@Request() req) {
    return this.reportsService.findVotingHistory(req.user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single report by ID' })
  findOne(@Param('id') id: string) {
    return this.reportsService.findOne(+id);
  }

  @Post(':id/vote')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Vote REAL or FAKE on a report' })
  vote(@Param('id') id: string, @Body('type') type: 'REAL' | 'FAKE', @Request() req) {
    return this.reportsService.vote(+id, req.user.userId, type);
  }
}
