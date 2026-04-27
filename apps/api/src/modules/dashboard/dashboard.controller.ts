import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('仪表盘')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * 获取概览统计
   */
  @Get('overview')
  @ApiOperation({ summary: '获取概览统计' })
  async getOverview(
    @CurrentUser() user: { sub: string },
    @Query('repositoryIds') repositoryIds?: string,
  ) {
    return this.dashboardService.getOverview(user.sub, repositoryIds);
  }

  /**
   * 获取活动图表数据
   */
  @Get('activity')
  @ApiOperation({ summary: '获取活动图表数据' })
  async getActivity(
    @CurrentUser() user: { sub: string },
    @Query('days') days?: number,
    @Query('repositoryIds') repositoryIds?: string,
  ) {
    return this.dashboardService.getActivity(user.sub, days, repositoryIds);
  }

  /**
   * 获取最近活动
   */
  @Get('recent-activity')
  @ApiOperation({ summary: '获取最近活动' })
  async getRecentActivity(
    @CurrentUser() user: { sub: string },
    @Query('limit') limit?: number,
    @Query('repositoryIds') repositoryIds?: string,
  ) {
    return this.dashboardService.getRecentActivity(user.sub, limit, repositoryIds);
  }
}
