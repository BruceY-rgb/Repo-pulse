import { apiClient } from './api-client';
import { dashboardService, type DashboardActivity } from './dashboard.service';
import { eventService } from './event.service';

export interface ReportMetrics {
  issues?: number;
  resolved?: number;
  prs?: number;
  critical?: number;
  high?: number;
  medium?: number;
  velocity?: string;
  reviewTime?: string;
  commits?: number;
}

export interface Report {
  id: number;
  title: string;
  date: string;
  type: 'weekly' | 'security' | 'team';
  summary: string;
  metrics: Record<string, number | string>;
}

export interface ReportData {
  weeklyData: { day: string; commits: number; prs: number; reviews: number }[];
  issueTypes: { name: string; value: number; color: string }[];
  recentReports: Report[];
}

const ISSUE_COLORS = [
  { name: 'Security', color: '#f85149' },
  { name: 'Performance', color: '#f0883e' },
  { name: 'Code Quality', color: '#58a6ff' },
  { name: 'Documentation', color: '#8b949e' },
  { name: 'Other', color: '#6e7681' },
];

function getWeekdayShort(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

export const reportService = {
  async getReportData(repositoryIds?: string[]): Promise<ReportData> {
    // Fetch activity chart data (daily commits, PRs, issues)
    let activityData: DashboardActivity[] = [];
    try {
      activityData = await dashboardService.getActivity(7, repositoryIds);
    } catch {
      // Fallback to empty data
    }

    // Transform to weeklyData format expected by the chart
    const weeklyData = activityData.map((d) => ({
      day: d.date,
      commits: d.commits,
      prs: d.prs,
      reviews: d.issues,
    }));

    // Fetch event stats for issue type distribution
    let statsTotal = 0;
    let statsByType: { type: string; count: number }[] = [];
    try {
      const stats = await eventService.getStats(repositoryIds);
      statsTotal = stats.total;
      statsByType = stats.byType;
    } catch {
      // Fallback
    }

    // Map event types to issue categories for the pie chart
    const categoryMap = new Map<string, number>();
    for (const item of statsByType) {
      if (item.type.includes('SECURITY') || item.type.includes('CRITICAL')) {
        categoryMap.set('Security', (categoryMap.get('Security') || 0) + item.count);
      } else if (
        item.type.includes('PERFORMANCE') ||
        item.type.includes('BENCHMARK')
      ) {
        categoryMap.set('Performance', (categoryMap.get('Performance') || 0) + item.count);
      } else if (
        item.type.includes('ISSUE') ||
        item.type.includes('BUG') ||
        item.type.includes('ERROR')
      ) {
        categoryMap.set('Documentation', (categoryMap.get('Documentation') || 0) + item.count);
      } else {
        categoryMap.set('Code Quality', (categoryMap.get('Code Quality') || 0) + item.count);
      }
    }

    // Build issueTypes from actual data or use defaults
    const issueTypes = ISSUE_COLORS.map((ic) => ({
      name: ic.name,
      value: categoryMap.get(ic.name) || 0,
      color: ic.color,
    })).filter((it) => it.value > 0);

    // If no real data, use a fallback that shows some structure
    if (issueTypes.length === 0) {
      issueTypes.push(
        { name: 'Code Quality', value: Math.max(1, statsTotal), color: '#58a6ff' },
      );
    }

    // Fetch reports list from API
    let recentReports: Report[] = [];
    try {
      const { data } = await apiClient.get<{ data: Report[] }>('/reports', {
        params: repositoryIds && repositoryIds.length > 0
          ? { repositoryIds: [...repositoryIds].sort().join(',') }
          : undefined,
      });
      recentReports = data.data;
    } catch {
      // Fallback to empty
    }

    return { weeklyData, issueTypes, recentReports };
  },
};
