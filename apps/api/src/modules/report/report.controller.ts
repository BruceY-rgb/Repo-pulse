import { Controller, Get, Post, Param, Body, Query, Res, UseGuards, NotFoundException } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReportService } from './report.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReportType, ReportFormat } from '@repo-pulse/database';

@ApiTags('报告')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get()
  @ApiOperation({ summary: '获取报告列表' })
  async getReports(
    @CurrentUser() user: { sub: string },
    @Query('repositoryIds') repositoryIds?: string,
  ) {
    return this.reportService.getReports(user.sub, repositoryIds);
  }

  @Post('generate')
  @ApiOperation({ summary: '生成新报告' })
  async generate(
    @CurrentUser() user: { sub: string },
    @Body()
    body: {
      repositoryIds?: string[];
      type: ReportType;
      format: ReportFormat;
      dateFrom?: string;
      dateTo?: string;
    },
  ) {
    return this.reportService.generateReport(user.sub, {
      repositoryIds: body.repositoryIds,
      type: body.type || ReportType.WEEKLY,
      format: body.format || ReportFormat.PDF,
      dateFrom: body.dateFrom,
      dateTo: body.dateTo,
    });
  }

  @Get(':id/download')
  @ApiOperation({ summary: '下载报告文件' })
  async download(@Param('id') id: string, @Res() res: Response) {
    const report = await this.reportService.getReportById(id);
    if (!report) throw new NotFoundException('Report not found');

    if (report.format === ReportFormat.PDF) {
      const base64 = report.content.replace('data:application/pdf;filename=generated.pdf;base64,', '');
      const buffer = Buffer.from(base64, 'base64');
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${report.title}.pdf"`,
        'Content-Length': buffer.length,
      });
      res.end(buffer);
    } else {
      res.set({
        'Content-Type': 'text/markdown',
        'Content-Disposition': `attachment; filename="${report.title}.md"`,
      });
      res.send(report.content);
    }
  }
}
