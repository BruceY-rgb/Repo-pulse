import { useMemo, useRef, useState } from 'react';
import { max, min } from 'd3-array';
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock,
  Download,
  ExternalLink,
  GitCommit,
  GitPullRequest,
  Layers3,
  Users,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type {
  ProjectRiverDashboardData,
  ProjectRiverEventMarker as BackendProjectRiverEventMarker,
  ProjectRiverKeyNode,
} from '@/services/dashboard.service';
import type { Event, Repository } from '@/types/api';

import { ProjectLayout } from './ProjectLayout';
import type { DockedEdge } from './ProjectLayout';
import { ProjectRiverStreamgraph } from './ProjectRiverStreamgraph';
import { HealthSummary } from './HealthSummary';
import { StreamgraphTooltip } from './StreamgraphTooltip';
import { EventMarkerTooltip } from './EventMarkerTooltip';
import { downloadStreamgraphSvg } from '@/utils/svgExport';

type Granularity = 'day' | 'week' | 'month';
type EventSeverity = 'positive' | 'warning' | 'info';
type VisibleRange = { start: string; end: string };

interface DailyRow {
  date: string;
  contributor: string;
  commits: number;
  linesAdded: number;
  linesDeleted: number;
  filesTouched: number;
  cumulativeCommits: number;
}

interface ProjectEventMarker {
  id: string;
  date: string;
  title: string;
  description: string;
  type: string;
  severity: EventSeverity;
  selected: boolean;
}

interface StreamgraphTooltipState {
  contributor: string;
  date: string;
  commits: number;
  totalCommits: number;
  percentage: number;
  x: number;
  y: number;
}

interface ProjectRiverRepositoryDashboardProps {
  error?: Error | null;
  events: Event[];
  isLoading: boolean;
  language: 'en' | 'zh';
  riverData?: ProjectRiverDashboardData;
  repository?: Repository;
  t: (key: string, params?: Record<string, string>) => string;
}

const OTHERS_LABEL = 'Other contributors';
const TOP_N_MAX = 100;
const TOP_N_OPTIONS = [5, 15, 25, 35];
const BOT_AUTHOR_KEYWORDS = ['system', 'agent', 'bot', 'ai analysis', 'feishu'];
const PROJECT_RIVER_HUES = {
  base: 244,
  spread: 92,
};

function isAutomationAuthor(author?: string | null) {
  if (!author) {
    return true;
  }

  const normalized = author.toLowerCase();
  return BOT_AUTHOR_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function getEventDate(event: Event) {
  const value = event.occurredAt ?? event.createdAt;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toWeekKey(dateStr: string) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  const day = date.getUTCDay();
  const diff = date.getUTCDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), diff));
  return monday.toISOString().slice(0, 10);
}

function toBucketDate(dateStr: string, granularity: Granularity) {
  if (granularity === 'day') {
    return dateStr;
  }
  if (granularity === 'week') {
    return toWeekKey(dateStr);
  }
  return `${dateStr.slice(0, 7)}-01`;
}

function getEventClassifier(event: Event) {
  return `${event.type} ${event.action}`.toLowerCase();
}

function isCommitEvent(event: Event) {
  const classifier = getEventClassifier(event);
  return classifier.includes('push') || classifier.includes('commit');
}

function getEventSeverity(event: Event): EventSeverity {
  const classifier = getEventClassifier(event);
  if (classifier.includes('release') || classifier.includes('merged') || classifier.includes('approval')) {
    return 'positive';
  }
  if (classifier.includes('security') || classifier.includes('failed') || classifier.includes('risk')) {
    return 'warning';
  }
  return 'info';
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function extractCommitCount(event: Event) {
  const metadata = event.metadata ?? {};
  const rawPayload = event.rawPayload ?? {};
  const direct =
    readNumber(metadata.commitCount) ??
    readNumber(metadata.commitsCount) ??
    readNumber(metadata.commit_count) ??
    readNumber(rawPayload.commitCount);
  if (direct !== undefined && direct > 0) {
    return direct;
  }
  const metadataCommits = metadata.commits;
  const rawCommits = rawPayload.commits;
  if (Array.isArray(metadataCommits) && metadataCommits.length > 0) {
    return metadataCommits.length;
  }
  if (Array.isArray(rawCommits) && rawCommits.length > 0) {
    return rawCommits.length;
  }
  return 1;
}

function extractFilesTouched(event: Event) {
  const metadata = event.metadata ?? {};
  const direct =
    readNumber(metadata.filesTouched) ??
    readNumber(metadata.changedFiles) ??
    readNumber(metadata.files_changed);
  return direct ?? 0;
}

function getDisplayEventType(event: Event) {
  const normalized = event.type.toLowerCase();
  if (normalized.includes('pull') || normalized.includes('pr_')) return 'pull_request';
  if (normalized.includes('issue')) return 'issue';
  if (normalized.includes('release')) return 'release';
  if (normalized.includes('security')) return 'security';
  if (normalized.includes('push') || normalized.includes('commit')) return 'push';
  return 'other';
}

function buildDailyRows(events: Event[]) {
  const bucket = new Map<string, DailyRow>();
  const sortedEvents = [...events]
    .filter((event) => isCommitEvent(event) && !isAutomationAuthor(event.author))
    .sort((left, right) => {
      const leftDate = getEventDate(left)?.getTime() ?? 0;
      const rightDate = getEventDate(right)?.getTime() ?? 0;
      return leftDate - rightDate;
    });

  sortedEvents.forEach((event) => {
    const date = getEventDate(event);
    if (!date) return;
    const contributor = event.author || 'Unknown';
    const dateKey = toIsoDate(date);
    const key = `${dateKey}:${contributor}`;
    const existing = bucket.get(key);
    const commits = extractCommitCount(event);
    if (existing) {
      existing.commits += commits;
      existing.filesTouched += extractFilesTouched(event);
    } else {
      bucket.set(key, {
        date: dateKey,
        contributor,
        commits,
        linesAdded: 0,
        linesDeleted: 0,
        filesTouched: extractFilesTouched(event),
        cumulativeCommits: 0,
      });
    }
  });

  const rows = Array.from(bucket.values()).sort((left, right) =>
    left.date.localeCompare(right.date) || left.contributor.localeCompare(right.contributor),
  );
  const cumulativeByContributor = new Map<string, number>();
  return rows.map((row) => {
    const cumulative = (cumulativeByContributor.get(row.contributor) ?? 0) + row.commits;
    cumulativeByContributor.set(row.contributor, cumulative);
    return { ...row, cumulativeCommits: cumulative };
  });
}

function applyTopN(rows: DailyRow[], n: number) {
  if (n <= 0) return rows;
  const totals = new Map<string, number>();
  rows.forEach((row) => {
    if (row.contributor !== OTHERS_LABEL) {
      totals.set(row.contributor, (totals.get(row.contributor) ?? 0) + row.commits);
    }
  });

  if (n >= totals.size) return rows;

  const topSet = new Set(
    Array.from(totals.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, n)
      .map(([name]) => name),
  );
  const result: DailyRow[] = [];
  const othersByDate = new Map<string, DailyRow>();

  rows.forEach((row) => {
    if (topSet.has(row.contributor)) {
      result.push(row);
      return;
    }

    const existing = othersByDate.get(row.date);
    if (existing) {
      existing.commits += row.commits;
      existing.linesAdded += row.linesAdded;
      existing.linesDeleted += row.linesDeleted;
      existing.filesTouched += row.filesTouched;
    } else {
      othersByDate.set(row.date, {
        date: row.date,
        contributor: OTHERS_LABEL,
        commits: row.commits,
        linesAdded: row.linesAdded,
        linesDeleted: row.linesDeleted,
        filesTouched: row.filesTouched,
        cumulativeCommits: 0,
      });
    }
  });

  let runningTotal = 0;
  Array.from(othersByDate.keys())
    .sort()
    .forEach((date) => {
      const row = othersByDate.get(date)!;
      runningTotal += row.commits;
      row.cumulativeCommits = runningTotal;
      result.push(row);
    });

  return result.sort((left, right) =>
    left.date.localeCompare(right.date) || left.contributor.localeCompare(right.contributor),
  );
}

function aggregateRows(rows: DailyRow[], granularity: Granularity) {
  if (granularity === 'day') return rows;
  const bucketMap = new Map<string, Map<string, DailyRow>>();

  rows.forEach((row) => {
    const bucket = toBucketDate(row.date, granularity);
    const contributorMap = bucketMap.get(bucket) ?? new Map<string, DailyRow>();
    bucketMap.set(bucket, contributorMap);
    const existing = contributorMap.get(row.contributor);
    if (existing) {
      existing.commits += row.commits;
      existing.linesAdded += row.linesAdded;
      existing.linesDeleted += row.linesDeleted;
      existing.filesTouched += row.filesTouched;
      existing.cumulativeCommits = Math.max(existing.cumulativeCommits, row.cumulativeCommits);
    } else {
      contributorMap.set(row.contributor, {
        ...row,
        date: bucket,
      });
    }
  });

  return Array.from(bucketMap.values())
    .flatMap((contributorMap) => Array.from(contributorMap.values()))
    .sort((left, right) =>
      left.date.localeCompare(right.date) || left.contributor.localeCompare(right.contributor),
    );
}

function getContributorColors(rows: DailyRow[]) {
  const meta = new Map<string, { firstCommitDate: string; totalCommits: number }>();
  rows.forEach((row) => {
    const existing = meta.get(row.contributor);
    if (!existing) {
      meta.set(row.contributor, {
        firstCommitDate: row.date,
        totalCommits: row.commits,
      });
      return;
    }
    existing.firstCommitDate = row.date < existing.firstCommitDate ? row.date : existing.firstCommitDate;
    existing.totalCommits += row.commits;
  });

  const entries = Array.from(meta.entries());
  if (entries.length === 0) return new Map<string, string>();
  const minDate = min(entries, ([, value]) => value.firstCommitDate) ?? entries[0][1].firstCommitDate;
  const maxDate = max(entries, ([, value]) => value.firstCommitDate) ?? entries[0][1].firstCommitDate;
  const minTime = new Date(minDate).getTime();
  const maxTime = new Date(maxDate).getTime();
  const dateSpan = maxTime - minTime || 1;
  const maxCommits = max(entries, ([, value]) => value.totalCommits) ?? 1;
  const colors = new Map<string, string>();

  entries.forEach(([name, value]) => {
    if (name === OTHERS_LABEL) {
      colors.set(name, 'hsl(var(--muted-foreground))');
      return;
    }
    const dateRatio = Math.max(0, Math.min(1, (new Date(value.firstCommitDate).getTime() - minTime) / dateSpan));
    const volumeRatio = Math.max(0, Math.min(1, Math.log10(value.totalCommits + 1) / (Math.log10(maxCommits + 1) || 1)));
    const hue = PROJECT_RIVER_HUES.base + dateRatio * PROJECT_RIVER_HUES.spread;
    const saturation = 42 + volumeRatio * 38;
    const lightness = 50 + volumeRatio * 12;
    colors.set(name, `hsl(${Math.round(hue)}, ${Math.round(saturation)}%, ${Math.round(lightness)}%)`);
  });

  return colors;
}

function getContributorsForRange(rows: DailyRow[], start?: string, end?: string, colors?: Map<string, string>) {
  const inRange = start && end ? rows.filter((row) => row.date >= start && row.date <= end) : rows;
  const commitsMap = new Map<string, number>();
  const cumulativeMap = new Map<string, number>();
  rows.forEach((row) => {
    cumulativeMap.set(row.contributor, Math.max(cumulativeMap.get(row.contributor) ?? 0, row.cumulativeCommits));
  });
  inRange.forEach((row) => {
    commitsMap.set(row.contributor, (commitsMap.get(row.contributor) ?? 0) + row.commits);
  });

  return Array.from(commitsMap.entries())
    .map(([contributor, monthlyCommits]) => ({
      contributor,
      monthlyCommits,
      cumulativeCommits: cumulativeMap.get(contributor) ?? monthlyCommits,
      color: colors?.get(contributor) ?? 'hsl(var(--muted-foreground))',
    }))
    .sort((left, right) =>
      right.monthlyCommits - left.monthlyCommits ||
      left.contributor.localeCompare(right.contributor),
    );
}

function getActiveDays(rows: DailyRow[], start?: string, end?: string) {
  const filtered = start && end ? rows.filter((row) => row.date >= start && row.date <= end) : rows;
  const dates = new Set(filtered.map((row) => row.date));
  if (dates.size === 0) return { active: 0, total: 0 };
  const sortedDates = Array.from(dates).sort();
  const rangeStart = start ?? sortedDates[0];
  const rangeEnd = end ?? sortedDates[sortedDates.length - 1];
  const total = Math.round((new Date(rangeEnd).getTime() - new Date(rangeStart).getTime()) / 86400000) + 1;
  return { active: dates.size, total: Math.max(total, dates.size) };
}

function formatDateRange(rows: DailyRow[]) {
  if (rows.length === 0) return '';
  const dates = rows.map((row) => row.date).sort();
  return `${dates[0]} - ${dates[dates.length - 1]}`;
}

function stringifyParams(params: Record<string, string | number>) {
  return Object.fromEntries(
    Object.entries(params).map(([key, value]) => [key, String(value)]),
  );
}

function formatKeyNodeTitle(
  node: ProjectRiverKeyNode,
  t: (key: string, params?: Record<string, string>) => string,
) {
  return t(`projectRiver.keyNodeTitles.${node.type}`, stringifyParams(node.params));
}

function formatKeyNodeDescription(
  node: ProjectRiverKeyNode,
  t: (key: string, params?: Record<string, string>) => string,
) {
  return t(`projectRiver.keyNodeDescriptions.${node.type}`, stringifyParams(node.params));
}

function buildProjectEventsFromKeyNodes(
  nodes: ProjectRiverKeyNode[],
  granularity: Granularity,
  t: (key: string, params?: Record<string, string>) => string,
) {
  return nodes
    .map<ProjectEventMarker>((node) => ({
      id: node.id,
      date: toBucketDate(node.date, granularity),
      title: formatKeyNodeTitle(node, t),
      description: formatKeyNodeDescription(node, t),
      type: node.type,
      severity: node.severity,
      selected: true,
    }))
    .sort((left, right) =>
      right.date.localeCompare(left.date) ||
      left.title.localeCompare(right.title),
    );
}

function buildProjectEventsFromBackendMarkers(
  markers: BackendProjectRiverEventMarker[],
  granularity: Granularity,
) {
  return markers
    .map<ProjectEventMarker>((marker) => ({
      id: marker.id,
      date: toBucketDate(marker.date, granularity),
      title: marker.title,
      description: marker.description,
      type: marker.type,
      severity: marker.severity,
      selected: true,
    }))
    .sort((left, right) => right.date.localeCompare(left.date));
}

function buildProjectEvents(events: Event[], granularity: Granularity) {
  return events
    .map<ProjectEventMarker | null>((event) => {
      const date = getEventDate(event);
      if (!date) return null;
      const type = getDisplayEventType(event);
      return {
        id: event.id,
        date: toBucketDate(toIsoDate(date), granularity),
        title: event.title,
        description: event.body || event.action || event.type,
        type,
        severity: getEventSeverity(event),
        selected: true,
      };
    })
    .filter((event): event is ProjectEventMarker => Boolean(event))
    .sort((left, right) => right.date.localeCompare(left.date));
}

function eventTypeLabel(type: string, t: (key: string, params?: Record<string, string>) => string) {
  switch (type) {
    case 'push':
      return t('projectRiver.eventTypes.push');
    case 'pull_request':
      return t('projectRiver.eventTypes.pullRequest');
    case 'issue':
      return t('projectRiver.eventTypes.issue');
    case 'release':
      return t('projectRiver.eventTypes.release');
    case 'security':
      return t('projectRiver.eventTypes.security');
    case 'contributor_first_commit':
      return t('projectRiver.keyNodeTypes.contributorFirstCommit');
    case 'contributor_exit':
      return t('projectRiver.keyNodeTypes.contributorExit');
    case 'activity_spike':
      return t('projectRiver.keyNodeTypes.activitySpike');
    case 'activity_drop':
      return t('projectRiver.keyNodeTypes.activityDrop');
    case 'major_refactor':
      return t('projectRiver.keyNodeTypes.majorRefactor');
    case 'commit_milestone':
      return t('projectRiver.keyNodeTypes.commitMilestone');
    case 'project_start':
      return t('projectRiver.keyNodeTypes.projectStart');
    case 'project_archived':
      return t('projectRiver.keyNodeTypes.projectArchived');
    default:
      return t('projectRiver.eventTypes.other');
  }
}

function severityClass(severity: EventSeverity) {
  if (severity === 'positive') return 'bg-[var(--github-success)]';
  if (severity === 'warning') return 'bg-[var(--github-warning)]';
  return 'bg-[var(--github-info)]';
}

function contributorLabel(contributor: string, t: (key: string, params?: Record<string, string>) => string) {
  return contributor === OTHERS_LABEL ? t('projectRiver.otherContributors') : contributor;
}

export function ProjectRiverRepositoryDashboard({
  error,
  events,
  isLoading,
  language,
  riverData,
  repository,
  t,
}: ProjectRiverRepositoryDashboardProps) {
  const [granularity, setGranularity] = useState<Granularity>('month');
  const [topN, setTopN] = useState(10);
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const [visibleRange, setVisibleRange] = useState<VisibleRange | null>(null);
  const [isTopMenuOpen, setIsTopMenuOpen] = useState(false);
  const [isKeyNodeMenuOpen, setIsKeyNodeMenuOpen] = useState(false);
  const [isTimeMenuOpen, setIsTimeMenuOpen] = useState(false);
  const [hoveredContributor, setHoveredContributor] = useState<string | null>(null);
  const [streamTooltip, setStreamTooltip] = useState<StreamgraphTooltipState | null>(null);
  const [hoveredEvent, setHoveredEvent] = useState<ProjectEventMarker | null>(null);
  const [hoveredEventCoords, setHoveredEventCoords] = useState<{ x: number; y: number } | null>(null);
  const [dockedEdge, setDockedEdge] = useState<DockedEdge>(() => {
    if (typeof window === 'undefined') return 'bottom';
    const saved = localStorage.getItem('pr:dockedEdge');
    return saved !== null ? (saved === 'null' ? null : (saved as DockedEdge)) : 'bottom';
  });
  const svgRef = useRef<SVGSVGElement | null>(null);

  const dailyRows = useMemo(
    () => riverData?.dailyRows ?? buildDailyRows(events),
    [events, riverData],
  );
  const baseProjectEvents = useMemo(() => {
    if (riverData?.keyNodes && riverData.keyNodes.length > 0) {
      return buildProjectEventsFromKeyNodes(riverData.keyNodes, granularity, t);
    }
    if (riverData?.eventMarkers && riverData.eventMarkers.length > 0) {
      return buildProjectEventsFromBackendMarkers(riverData.eventMarkers, granularity);
    }
    return buildProjectEvents(events, granularity);
  }, [events, granularity, riverData, t]);
  const eventTypes = useMemo(() => {
    return [
      'push',
      'pull_request',
      'issue',
      'release',
      'security',
      'contributor_first_commit',
      'contributor_exit',
      'activity_spike',
      'activity_drop',
      'major_refactor',
      'commit_milestone',
      'project_start',
      'project_archived',
    ];
  }, []);
  const [disabledTypes, setDisabledTypes] = useState<Set<string>>(() => new Set());
  const selectedTypes = useMemo(
    () => new Set(eventTypes.filter((type) => !disabledTypes.has(type))),
    [disabledTypes, eventTypes],
  );
  const eventTypeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of baseProjectEvents) {
      const type = event.type;
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }
    return counts;
  }, [baseProjectEvents]);

  const availableYears = useMemo(
    () => Array.from(new Set(dailyRows.map((row) => row.date.slice(0, 4)))).sort(),
    [dailyRows],
  );
  const filteredBaseRows = useMemo(
    () => selectedYear
      ? dailyRows.filter((row) => row.date.startsWith(selectedYear))
      : dailyRows,
    [dailyRows, selectedYear],
  );
  const autoTopN = useMemo(() => {
    const totals = new Map<string, number>();
    let total = 0;
    filteredBaseRows.forEach((row) => {
      totals.set(row.contributor, (totals.get(row.contributor) ?? 0) + row.commits);
      total += row.commits;
    });
    if (total === 0) return 10;
    const sorted = Array.from(totals.values()).sort((left, right) => right - left);
    let cumulative = 0;
    for (let index = 0; index < sorted.length; index += 1) {
      cumulative += sorted[index];
      if (cumulative >= total * 0.95) {
        return Math.max(1, Math.min(TOP_N_MAX - 1, index + 1));
      }
    }
    return Math.min(TOP_N_MAX - 1, sorted.length);
  }, [filteredBaseRows]);
  const effectiveTopN = topN || autoTopN;
  const topNRows = useMemo(
    () => applyTopN(filteredBaseRows, effectiveTopN),
    [effectiveTopN, filteredBaseRows],
  );
  const aggregatedRows = useMemo(
    () => aggregateRows(topNRows, granularity),
    [granularity, topNRows],
  );
  const hoveredRow = useMemo(() => {
    if (!streamTooltip) return null;
    return aggregatedRows.find(
      (r) => r.contributor === streamTooltip.contributor && r.date === streamTooltip.date
    );
  }, [streamTooltip, aggregatedRows]);

  const colorMap = useMemo(() => getContributorColors(topNRows), [topNRows]);
  const projectEvents = useMemo(
    () => baseProjectEvents.map((event) => ({
      ...event,
      selected: selectedTypes.has(event.type),
    })),
    [baseProjectEvents, selectedTypes],
  );
  const visibleEvents = useMemo(() => {
    let filtered = selectedYear
      ? projectEvents.filter((event) => event.date.startsWith(selectedYear))
      : projectEvents;
    if (visibleRange) {
      filtered = filtered.filter((event) => event.date >= visibleRange.start && event.date <= visibleRange.end);
    }
    return filtered.filter((event) => event.selected).slice(0, 80);
  }, [projectEvents, selectedYear, visibleRange]);
  const contributors = useMemo(
    () => getContributorsForRange(topNRows, visibleRange?.start, visibleRange?.end, colorMap),
    [colorMap, topNRows, visibleRange],
  );
  const activeDays = useMemo(
    () => getActiveDays(topNRows, visibleRange?.start, visibleRange?.end),
    [topNRows, visibleRange],
  );
  const commitTotal = useMemo(
    () => topNRows
      .filter((row) => !visibleRange || (row.date >= visibleRange.start && row.date <= visibleRange.end))
      .reduce((sum, row) => sum + row.commits, 0),
    [topNRows, visibleRange],
  );
  const contributorTotal = new Set(dailyRows.map((row) => row.contributor)).size;
  const highRiskEvents = baseProjectEvents.filter((event) => event.severity === 'warning').length;
  const recentTimestamp = riverData?.summary.latestEventAt
    ? new Date(riverData.summary.latestEventAt).getTime()
    : max(
        [
          ...dailyRows.map((row) => `${row.date}T00:00:00Z`),
          ...baseProjectEvents.map((event) => `${event.date}T00:00:00Z`),
        ],
        (value) => new Date(value).getTime(),
      );
  const recentLabel = recentTimestamp
    ? new Date(recentTimestamp).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US')
    : '';
  const topLabel = `${t('projectRiver.topLabel')} ${effectiveTopN}`;
  const timeLabel = selectedYear ?? t('projectRiver.allHistory');

  const handleExportSvg = () => {
    if (!svgRef.current) return;
    const filename = `${repository?.name ?? 'repository'}-river-streamgraph.svg`;
    const contributorNames = contributors.map((c) => c.contributor);
    const metadata = {
      projectName: repository?.fullName ?? 'Repository Dashboard',
      dateRange: formatDateRange(dailyRows),
      healthSignals: (riverData?.healthSignals ?? []).map((sig) => ({
        label: t(sig.label),
        severity: sig.severity,
      })),
      localeStrings: {
        more: language === 'zh' ? '以及其他 {count} 位贡献者' : '+{count} more contributors',
      },
    };
    const isDarkTheme = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
    downloadStreamgraphSvg(svgRef.current, filename, contributorNames, colorMap, metadata, isDarkTheme);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[520px] items-center justify-center text-sm text-muted-foreground">
        <span className="mr-3 inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--github-info)]" />
        {t('projectRiver.loading')}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="card-github">
        <CardContent className="p-6 text-sm text-destructive">
          {t('projectRiver.error')}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="shrink-0 space-y-3 border-b border-border px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-3xl font-semibold tracking-tight text-foreground">
              {repository?.fullName ?? t('projectRiver.unknownRepository')}
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {t('projectRiver.subtitle')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleExportSvg}
            >
              <Download className="h-4 w-4" />
              {t('projectRiver.exportSvg')}
            </Button>
            {repository?.url ? (
              <Button asChild variant="outline" size="sm" className="gap-2">
                <a href={repository.url} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  {t('projectRiver.openGithub')}
                </a>
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            {formatDateRange(dailyRows) || t('projectRiver.noDateRange')}
          </span>
          <span className="text-border">/</span>
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            {t('projectRiver.contributors')}: {contributorTotal}
          </span>
          <span className="text-border">/</span>
          <span className="flex items-center gap-1.5">
            <GitCommit className="h-3.5 w-3.5" />
            {t('projectRiver.commits')}: {commitTotal}
          </span>
          {recentLabel ? (
            <>
              <span className="text-border">/</span>
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {t('projectRiver.latestActivity')}: {recentLabel}
              </span>
            </>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-2">
            <Badge className="badge-info gap-1.5">
              <CheckCircle2 className="h-3 w-3" />
              {t('projectRiver.signal.coverage')}: {t('projectRiver.topLabel')} {effectiveTopN}
            </Badge>
            {highRiskEvents > 0 ? (
              <Badge className="badge-warning gap-1.5">
                <CircleAlert className="h-3 w-3" />
                {t('projectRiver.signal.warning')}: {highRiskEvents}
              </Badge>
            ) : (
              <Badge className="badge-success gap-1.5">
                <CheckCircle2 className="h-3 w-3" />
                {t('projectRiver.signal.stable')}
              </Badge>
            )}
          </div>
          <HealthSummary signals={riverData?.healthSignals} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-6 py-4">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                className={cn(
                  'flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground',
                  isTopMenuOpen && 'bg-secondary text-foreground',
                )}
                onClick={() => {
                  setIsTopMenuOpen((open) => !open);
                  setIsKeyNodeMenuOpen(false);
                  setIsTimeMenuOpen(false);
                }}
              >
                <Users className="h-3.5 w-3.5" />
                {topLabel}
                <ChevronDown className={cn('h-3 w-3 transition-transform', isTopMenuOpen && 'rotate-180')} />
              </button>
              {isTopMenuOpen ? (
                <div className="absolute left-0 top-full z-50 mt-1.5 w-40 rounded-lg border border-border bg-card py-1 shadow-xl">
                  {TOP_N_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={cn(
                        'flex w-full items-center justify-between px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
                        topN === option && 'bg-secondary/80 text-foreground',
                      )}
                      onClick={() => {
                        setVisibleRange(null);
                        setTopN(option);
                        setIsTopMenuOpen(false);
                      }}
                    >
                      <span>{t('projectRiver.topLabel')} {option}</span>
                      {topN === option ? <CheckCircle2 className="h-3 w-3 text-primary" /> : null}
                    </button>
                  ))}
                  <div className="my-1 border-t border-border" />
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center justify-between px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
                      topN === 0 && 'bg-secondary/80 text-foreground',
                    )}
                    onClick={() => {
                      setVisibleRange(null);
                      setTopN(0);
                      setIsTopMenuOpen(false);
                    }}
                  >
                    <span>{t('projectRiver.topAuto')} · {topLabel}</span>
                    {topN === 0 ? <CheckCircle2 className="h-3 w-3 text-primary" /> : null}
                  </button>
                </div>
              ) : null}
            </div>

            <div className="relative">
              <button
                type="button"
                className={cn(
                  'flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground',
                  isKeyNodeMenuOpen && 'bg-secondary text-foreground',
                )}
                onClick={() => {
                  setIsKeyNodeMenuOpen((open) => !open);
                  setIsTopMenuOpen(false);
                  setIsTimeMenuOpen(false);
                }}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {t('projectRiver.keyNodes')}
                <ChevronDown className={cn('h-3 w-3 transition-transform', isKeyNodeMenuOpen && 'rotate-180')} />
              </button>
              {isKeyNodeMenuOpen ? (
                <div className="absolute left-0 top-full z-50 mt-1.5 w-56 rounded-lg border border-border bg-card py-2 shadow-xl">
                  {eventTypes.map((type) => {
                    const checked = selectedTypes.has(type);
                    const count = eventTypeCounts.get(type) ?? 0;
                    return (
                      <button
                        key={type}
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                        onClick={() => {
                          setDisabledTypes((current) => {
                            const next = new Set(current);
                            if (next.has(type)) next.delete(type);
                            else next.add(type);
                            return next;
                          });
                        }}
                      >
                        <span
                          className={cn(
                            'h-3.5 w-3.5 rounded border border-border',
                            checked && 'border-primary bg-primary',
                          )}
                        />
                        <span className="flex-1">{eventTypeLabel(type, t)}</span>
                        <span className="tabular-nums text-muted-foreground">{count}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                className={cn(
                  'flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground',
                  isTimeMenuOpen && 'bg-secondary text-foreground',
                )}
                onClick={() => {
                  setIsTimeMenuOpen((open) => !open);
                  setIsTopMenuOpen(false);
                  setIsKeyNodeMenuOpen(false);
                }}
              >
                <CalendarDays className="h-3.5 w-3.5" />
                <span className="max-w-24 truncate tabular-nums">{timeLabel}</span>
                <ChevronDown className={cn('h-3 w-3 transition-transform', isTimeMenuOpen && 'rotate-180')} />
              </button>
              {isTimeMenuOpen ? (
                <div className="absolute right-0 top-full z-50 mt-1.5 max-h-72 w-40 overflow-y-auto rounded-lg border border-border bg-card py-1 shadow-xl">
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center justify-between px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
                      !selectedYear && 'bg-secondary/80 text-foreground',
                    )}
                    onClick={() => {
                      setVisibleRange(null);
                      setSelectedYear(null);
                      setIsTimeMenuOpen(false);
                    }}
                  >
                    <span>{t('projectRiver.allHistory')}</span>
                    {!selectedYear ? <CheckCircle2 className="h-3 w-3 text-primary" /> : null}
                  </button>
                  {availableYears.length > 0 ? <div className="my-1 border-t border-border" /> : null}
                  {availableYears.map((year) => (
                    <button
                      key={year}
                      type="button"
                      className={cn(
                        'flex w-full items-center justify-between px-3 py-1.5 text-left text-xs tabular-nums text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
                        selectedYear === year && 'bg-secondary/80 text-foreground',
                      )}
                      onClick={() => {
                        setVisibleRange(null);
                        setSelectedYear(year);
                        setIsTimeMenuOpen(false);
                      }}
                    >
                      <span>{year}</span>
                      {selectedYear === year ? <CheckCircle2 className="h-3 w-3 text-primary" /> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="inline-flex rounded-md bg-secondary/45 p-0.5">
              {(['day', 'week', 'month'] as Granularity[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={cn(
                    'h-7 rounded px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground',
                    granularity === value && 'bg-secondary text-foreground shadow-sm',
                  )}
                  onClick={() => {
                    setVisibleRange(null);
                    setGranularity(value);
                  }}
                >
                  {t(`projectRiver.granularity.${value}`)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 relative">
          <ProjectLayout
            dockedEdge={dockedEdge}
            onDockEdgeChange={(edge) => {
              setDockedEdge(edge);
              localStorage.setItem('pr:dockedEdge', edge === null ? 'null' : edge);
            }}
            chart={
              <div className="relative w-full h-full min-h-0 bg-background/25 rounded-xl border border-border overflow-hidden">
                <ProjectRiverStreamgraph
                  svgRef={svgRef}
                  colorMap={colorMap}
                  eventMarkers={projectEvents}
                  highlightedContributor={hoveredContributor}
                  onHoverContributor={(payload) => {
                    setStreamTooltip(payload);
                    setHoveredContributor(payload?.contributor ?? null);
                  }}
                  onHoverEvent={(event, coords) => {
                    setHoveredEvent(event);
                    setHoveredEventCoords(coords);
                  }}
                  onRangeChange={setVisibleRange}
                  rows={aggregatedRows}
                  t={t}
                  visibleRange={visibleRange}
                />
                <StreamgraphTooltip
                  visible={Boolean(streamTooltip)}
                  x={streamTooltip?.x ?? 0}
                  y={streamTooltip?.y ?? 0}
                  contributor={streamTooltip?.contributor ?? ''}
                  date={streamTooltip?.date ?? ''}
                  commits={streamTooltip?.commits ?? 0}
                  linesAdded={hoveredRow?.linesAdded ?? 0}
                  linesDeleted={hoveredRow?.linesDeleted ?? 0}
                  filesTouched={hoveredRow?.filesTouched ?? 0}
                  percentage={streamTooltip?.percentage ?? 0}
                  totalCommits={streamTooltip?.totalCommits ?? 0}
                />
                <EventMarkerTooltip
                  visible={Boolean(hoveredEvent && hoveredEventCoords)}
                  x={hoveredEventCoords?.x ?? 0}
                  y={hoveredEventCoords?.y ?? 0}
                  event={hoveredEvent}
                />
              </div>
            }
            panel={
              dockedEdge === 'bottom' || dockedEdge === 'top' ? (
                <div className="flex h-full flex-row overflow-hidden divide-x divide-border bg-card/40">
                  {/* Column 1: Events Log */}
                  <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
                    <div className="border-b border-border px-4 py-2 shrink-0">
                      <div className="flex items-center gap-2">
                        <Layers3 className="h-4 w-4 text-primary" />
                        <p className="text-xs font-semibold uppercase tracking-wider text-foreground">
                          {t('projectRiver.eventsPanel')}
                        </p>
                        <Badge variant="outline" className="ml-auto rounded-full text-[10px]">
                          {visibleEvents.length}/{baseProjectEvents.length}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      {visibleEvents.length > 0 ? visibleEvents.map((event) => (
                        <div
                          key={event.id}
                          className="flex cursor-default items-start gap-3 border-b border-border/60 px-4 py-2 last:border-b-0 hover:bg-secondary/60"
                          onMouseEnter={(e) => {
                            setHoveredEvent(event);
                            setHoveredEventCoords({ x: e.clientX, y: e.clientY });
                          }}
                          onMouseLeave={() => {
                            setHoveredEvent(null);
                            setHoveredEventCoords(null);
                          }}
                        >
                          <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', severityClass(event.severity))} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] tabular-nums text-muted-foreground">
                                {event.date.replace(/-/g, '.')}
                              </span>
                              <span className="text-[10px] font-medium text-primary">
                                {eventTypeLabel(event.type, t)}
                              </span>
                            </div>
                            <p className="mt-1 truncate text-xs text-foreground">{event.title}</p>
                            <p className="mt-1 truncate text-[11px] text-muted-foreground">{event.description}</p>
                          </div>
                        </div>
                      )) : (
                        <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                          {t('projectRiver.eventsEmpty')}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Column 2: Overview Stats */}
                  <div className="w-80 shrink-0 flex flex-col h-full overflow-hidden">
                    <div className="border-b border-border px-4 py-2 shrink-0">
                      <div className="flex items-center gap-2">
                        <GitPullRequest className="h-4 w-4 text-primary" />
                        <p className="text-xs font-semibold uppercase tracking-wider text-foreground">
                          {selectedYear ?? t('projectRiver.allHistory')}
                        </p>
                      </div>
                    </div>
                    <div className="flex-1 p-3 flex flex-col justify-center">
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <p className="text-[10px] text-muted-foreground">{t('projectRiver.commits')}</p>
                          <p className="text-base font-semibold tabular-nums text-foreground">{commitTotal}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">{t('projectRiver.activeContributors')}</p>
                          <p className="text-base font-semibold tabular-nums text-foreground">
                            {contributors.filter((contributor) => contributor.monthlyCommits > 0).length}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">{t('projectRiver.activeDays')}</p>
                          <p className="text-base font-semibold tabular-nums text-foreground">
                            {activeDays.active}
                            <span className="text-xs font-normal text-muted-foreground">/{activeDays.total}</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Column 3: Contributors */}
                  <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
                    <div className="border-b border-border px-4 py-2 shrink-0 flex items-center justify-between">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t('projectRiver.contributors')}</span>
                      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t('projectRiver.total')}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto px-2 py-3">
                      {contributors.map((contributor, index) => (
                        <div
                          key={contributor.contributor}
                          className="flex items-center justify-between gap-3 rounded-md px-2 py-1 hover:bg-secondary/60"
                          onMouseEnter={() => setHoveredContributor(contributor.contributor)}
                          onMouseLeave={() => setHoveredContributor(null)}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="w-5 text-right text-[10px] tabular-nums text-muted-foreground">{index + 1}</span>
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-sm"
                              style={{ backgroundColor: contributor.color }}
                            />
                            <span className="truncate text-sm text-foreground">
                              {contributorLabel(contributor.contributor, t)}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs">
                            <span className="font-semibold tabular-nums text-foreground">{contributor.monthlyCommits}</span>
                            <span className="w-10 text-right tabular-nums text-muted-foreground">
                              {contributor.cumulativeCommits}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full flex-col overflow-hidden">
                  <div className="border-b border-border px-4 py-3 shrink-0">
                    <div className="flex items-center gap-2">
                      <Layers3 className="h-4 w-4 text-primary" />
                      <p className="text-xs font-semibold uppercase tracking-wider text-foreground">
                        {t('projectRiver.eventsPanel')}
                      </p>
                      <Badge variant="outline" className="ml-auto rounded-full text-[10px]">
                        {visibleEvents.length}/{baseProjectEvents.length}
                      </Badge>
                    </div>
                  </div>
                  <div className="max-h-[200px] min-h-[120px] shrink-0 overflow-y-auto border-b border-border">
                    {visibleEvents.length > 0 ? visibleEvents.map((event) => (
                      <div
                        key={event.id}
                        className="flex cursor-default items-start gap-3 border-b border-border/60 px-4 py-3 last:border-b-0 hover:bg-secondary/60"
                        onMouseEnter={(e) => {
                          setHoveredEvent(event);
                          setHoveredEventCoords({ x: e.clientX, y: e.clientY });
                        }}
                        onMouseLeave={() => {
                          setHoveredEvent(null);
                          setHoveredEventCoords(null);
                        }}
                      >
                        <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', severityClass(event.severity))} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] tabular-nums text-muted-foreground">
                              {event.date.replace(/-/g, '.')}
                            </span>
                            <span className="text-[10px] font-medium text-primary">
                              {eventTypeLabel(event.type, t)}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-xs text-foreground">{event.title}</p>
                          <p className="mt-1 truncate text-[11px] text-muted-foreground">{event.description}</p>
                        </div>
                      </div>
                    )) : (
                      <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                        {t('projectRiver.eventsEmpty')}
                      </div>
                    )}
                  </div>

                  <div className="border-b border-border px-4 py-3 shrink-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <GitPullRequest className="h-4 w-4 text-primary" />
                        <p className="text-xs font-semibold uppercase tracking-wider text-foreground">
                          {selectedYear ?? t('projectRiver.allHistory')}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-[10px] text-muted-foreground">{t('projectRiver.commits')}</p>
                        <p className="text-base font-semibold tabular-nums text-foreground">{commitTotal}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">{t('projectRiver.activeContributors')}</p>
                        <p className="text-base font-semibold tabular-nums text-foreground">
                          {contributors.filter((contributor) => contributor.monthlyCommits > 0).length}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">{t('projectRiver.activeDays')}</p>
                        <p className="text-base font-semibold tabular-nums text-foreground">
                          {activeDays.active}
                          <span className="text-xs font-normal text-muted-foreground">/{activeDays.total}</span>
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                    <div className="mb-2 flex items-center justify-between text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      <span>{t('projectRiver.contributors')}</span>
                      <span>{t('projectRiver.total')}</span>
                    </div>
                    {contributors.map((contributor, index) => (
                      <div
                        key={contributor.contributor}
                        className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-secondary/60"
                        onMouseEnter={() => setHoveredContributor(contributor.contributor)}
                        onMouseLeave={() => setHoveredContributor(null)}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="w-5 text-right text-[10px] tabular-nums text-muted-foreground">{index + 1}</span>
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-sm"
                            style={{ backgroundColor: contributor.color }}
                          />
                          <span className="truncate text-sm text-foreground">
                            {contributorLabel(contributor.contributor, t)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className="font-semibold tabular-nums text-foreground">{contributor.monthlyCommits}</span>
                          <span className="w-10 text-right tabular-nums text-muted-foreground">
                            {contributor.cumulativeCommits}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            }
          />
        </div>
      </div>
    </div>
  );
}
