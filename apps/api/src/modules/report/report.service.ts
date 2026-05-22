import { Injectable, Logger } from '@nestjs/common';
import { prisma, EventType, ReportType, ReportFormat, ReportStatus } from '@repo-pulse/database';
import { jsPDF } from 'jspdf';
import { RepositoryOperationForbiddenException } from '../../common/exceptions/repository-operation-forbidden.exception';
import { getAccessibleRepositoryIds } from '../../common/utils/repository-access';

export interface ReportMetrics {
  commits: number;
  prs: number;
  issues: number;
  resolved: number;
}

export interface SecurityMetrics {
  critical: number;
  high: number;
  medium: number;
}

export interface TeamMetrics {
  prs: number;
  commits: number;
  avgCommitsPerPR: number;
}

export interface ReportItem {
  id: number;
  title: string;
  date: string;
  type: 'weekly' | 'security' | 'team';
  summary: string;
  metrics: ReportMetrics | SecurityMetrics | TeamMetrics;
}

interface GenerateReportParams {
  repositoryIds?: string[];
  type: ReportType;
  format: ReportFormat;
  dateFrom?: string;
  dateTo?: string;
}

@Injectable()
export class ReportService {
  private readonly logger = new Logger(ReportService.name);

  private async resolveRepositoryIds(
    userId: string,
    repositoryIdsParam?: string,
    options?: { editableOnly?: boolean },
  ): Promise<string[]> {
    const accessibleIds = await getAccessibleRepositoryIds(userId, {
      editableOnly: options?.editableOnly,
    });

    // 读取用户的监控范围，优先使用监控范围内的仓库
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true },
    });
    const prefs = (user?.preferences as Record<string, unknown>) || {};
    const scope = (prefs.monitoringScope as Record<string, unknown>) || {};
    const scopeRepoIds = Array.isArray(scope.repositoryIds)
      ? (scope.repositoryIds as string[]).filter((id) => accessibleIds.includes(id))
      : accessibleIds;

    const effectiveIds = scopeRepoIds.length > 0 ? scopeRepoIds : [];

    if (!repositoryIdsParam) return effectiveIds;

    const requested = repositoryIdsParam
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    const effectiveSet = new Set(effectiveIds);
    return requested.filter((id) => effectiveSet.has(id));
  }

  async getReports(
    userId: string,
    repositoryIdsParam?: string,
    dateFromParam?: string,
    dateToParam?: string,
  ): Promise<ReportItem[]> {
    const repositoryIds = await this.resolveRepositoryIds(userId, repositoryIdsParam);

    if (repositoryIds.length === 0) {
      return [];
    }

    const now = new Date();
    const dateTo = dateToParam ? new Date(dateToParam) : now;
    const dateFrom = dateFromParam ? new Date(dateFromParam) : new Date(dateTo.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Query events within the date range
    const events = await prisma.event.findMany({
      where: {
        repositoryId: { in: repositoryIds },
        occurredAt: { gte: dateFrom, lte: dateTo },
      },
      select: { type: true, id: true },
    });

    const pushCount = events.filter((e) => e.type === EventType.PUSH).length;
    const prOpened = events.filter((e) => e.type === EventType.PR_OPENED).length;
    const prMerged = events.filter((e) => e.type === EventType.PR_MERGED).length;
    const prClosed = events.filter((e) => e.type === EventType.PR_CLOSED).length;
    const issueOpened = events.filter((e) => e.type === EventType.ISSUE_OPENED).length;
    const issueClosed = events.filter((e) => e.type === EventType.ISSUE_CLOSED).length;

    const totalPRs = prOpened + prMerged + prClosed;
    const totalIssues = issueOpened + issueClosed;

    // Get risk-level counts within the date range
    const criticalRiskCount = await prisma.aIAnalysis.count({
      where: {
        event: { repositoryId: { in: repositoryIds } },
        riskLevel: 'CRITICAL',
        createdAt: { gte: dateFrom, lte: dateTo },
      },
    });

    const highRiskCount = await prisma.aIAnalysis.count({
      where: {
        event: { repositoryId: { in: repositoryIds } },
        riskLevel: 'HIGH',
        createdAt: { gte: dateFrom, lte: dateTo },
      },
    });

    const mediumRiskCount = await prisma.aIAnalysis.count({
      where: {
        event: { repositoryId: { in: repositoryIds } },
        riskLevel: 'MEDIUM',
        createdAt: { gte: dateFrom, lte: dateTo },
      },
    });

    const resolvedCount = issueClosed + prMerged;

    const weeklySummary = this.buildWeeklySummary(pushCount, totalPRs, totalIssues, resolvedCount);
    const securitySummary = this.buildSecuritySummary(criticalRiskCount, highRiskCount, mediumRiskCount);
    const teamSummary = this.buildTeamSummary(totalPRs, pushCount);

    const today = now.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    return [
      {
        id: 1,
        title: 'Weekly Code Quality Report',
        date: today,
        type: 'weekly',
        summary: weeklySummary,
        metrics: {
          commits: pushCount,
          prs: totalPRs,
          issues: totalIssues,
          resolved: resolvedCount,
        },
      },
      {
        id: 2,
        title: 'Security Audit Report',
        date: today,
        type: 'security',
        summary: securitySummary,
        metrics: {
          critical: criticalRiskCount,
          high: highRiskCount,
          medium: mediumRiskCount,
        },
      },
      {
        id: 3,
        title: 'Team Performance Report',
        date: today,
        type: 'team',
        summary: teamSummary,
        metrics: {
          prs: totalPRs,
          commits: pushCount,
          avgCommitsPerPR: totalPRs > 0 ? Math.round(pushCount / totalPRs) : 0,
        },
      },
    ];
  }

  private buildWeeklySummary(
    commits: number,
    prs: number,
    issues: number,
    resolved: number,
  ): string {
    var total = commits + prs + issues;
    var rate = issues + prs > 0 ? Math.round((resolved / (issues + prs)) * 100) : 0;
    return `${total} total activities, ${commits} commits, ${prs} PRs, ${issues} issues. ${resolved} resolved (${rate}% resolution rate).`;
  }

  private buildSecuritySummary(critical: number, high: number, medium: number): string {
    if (critical === 0 && high === 0 && medium === 0) {
      return 'No critical or high-risk issues detected this period. Codebase security posture is stable.';
    }
    return `${critical} critical vulnerabilities found, ${high} high-risk items, ${medium} medium. Immediate action recommended for critical items.`;
  }

  private buildTeamSummary(prs: number, commits: number): string {
    if (prs === 0) {
      return 'No significant team activity detected this period.';
    }
    var avg = prs > 0 ? Math.round(commits / prs) : 0;
    return `Team processed ${prs} pull requests, ${commits} commits across all repositories (avg ${avg} commits per PR).`;
  }

  async getReportById(reportId: string) {
    return prisma.report.findUnique({ where: { id: reportId } });
  }

  async generateReport(userId: string, params: GenerateReportParams) {
    const repositoryIds = await this.resolveRepositoryIds(
      userId,
      params.repositoryIds?.join(','),
      { editableOnly: true },
    );

    if (repositoryIds.length === 0) {
      throw new RepositoryOperationForbiddenException();
    }

    const reports = await this.getReports(
      userId,
      repositoryIds.join(','),
      params.dateFrom,
      params.dateTo,
    );
    if (reports.length === 0) {
      throw new Error('No data available for the selected period');
    }

    const now = new Date();
    const defaultDays = 7;
    const dateFrom = params.dateFrom ? new Date(params.dateFrom) : new Date(now.getTime() - defaultDays * 24 * 60 * 60 * 1000);
    const dateTo = params.dateTo ? new Date(params.dateTo) : now;

    let content: string;
    if (params.format === ReportFormat.PDF) {
      content = this.generatePdfBuffer(reports, dateFrom, dateTo);
    } else {
      content = this.generateMarkdown(reports, dateFrom, dateTo);
    }

    const title = `Report_${params.type}_${now.toISOString().slice(0, 10)}`;
    const report = await prisma.report.create({
      data: {
        type: params.type,
        title,
        content,
        format: params.format,
        repositoryIds,
        dateFrom,
        dateTo,
        generatedBy: userId,
        status: ReportStatus.COMPLETED,
      },
    });

    this.logger.log(`report_generated id=${report.id} type=${params.type} format=${params.format}`);
    return report;
  }

  private generatePdfBuffer(reports: ReportItem[], dateFrom: Date, dateTo: Date): string {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 20;

    // Title
    doc.setFontSize(18);
    doc.text('Repo-Pulse Report', pageWidth / 2, y, { align: 'center' });
    y += 10;
    doc.setFontSize(10);
    doc.text(`${dateFrom.toLocaleDateString()} - ${dateTo.toLocaleDateString()}`, pageWidth / 2, y, { align: 'center' });
    y += 15;

    for (const report of reports) {
      if (y > 250) { doc.addPage(); y = 20; }

      doc.setFontSize(14);
      doc.text(report.title, 20, y);
      y += 8;

      doc.setFontSize(10);
      const summaryLines = doc.splitTextToSize(report.summary, pageWidth - 40);
      for (const line of summaryLines.slice(0, 5)) {
        doc.text(line, 20, y);
        y += 5;
      }
      y += 5;

      // Metrics table
      doc.setFontSize(9);
      const metrics = report.metrics;
      doc.text('Metric', 20, y);
      doc.text('Value', 80, y);
      y += 5;

      for (const [key, value] of Object.entries(metrics)) {
        doc.text(key, 22, y);
        doc.text(String(value), 82, y);
        y += 5;
      }
      y += 10;
    }

    // Footer
    doc.setFontSize(8);
    doc.text(`Generated by Repo-Pulse on ${new Date().toLocaleString()}`, pageWidth / 2, 280, { align: 'center' });

    return doc.output('datauristring');
  }

  private generateMarkdown(reports: ReportItem[], dateFrom: Date, dateTo: Date): string {
    const lines: string[] = [
      '# Repo-Pulse Report',
      '',
      `**Period**: ${dateFrom.toLocaleDateString()} - ${dateTo.toLocaleDateString()}`,
      '',
    ];

    for (const report of reports) {
      lines.push(`## ${report.title}`, '', report.summary, '');
      lines.push('### Metrics', '');
      lines.push('| Metric | Value |', '| --- | --- |');
      for (const [key, value] of Object.entries(report.metrics)) {
        lines.push(`| ${key} | ${value} |`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}
