import { useMemo, useRef, useState } from 'react';
import { extent, max, min } from 'd3-array';
import { scaleLinear, scaleUtc } from 'd3-scale';
import {
  area,
  curveBasis,
  stack,
  stackOffsetWiggle,
  stackOrderInsideOut,
} from 'd3-shape';
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock,
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

interface PivotedRow {
  date: Date;
  dateKey: string;
  [contributor: string]: Date | number | string;
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
const STREAM_WIDTH = 1180;
const STREAM_HEIGHT = 520;
const STREAM_MARGIN = { top: 24, right: 24, bottom: 24, left: 48 };
const BRUSH_HEIGHT = 50;
const BRUSH_GAP = 16;
const MAX_CONTRIBUTOR_LABELS = 8;
const MAX_SPIKE_MARKERS = 5;
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

function pivotDailyData(rows: DailyRow[]) {
  const contributors = Array.from(new Set(rows.map((row) => row.contributor))).sort();
  const dateSet = new Set(rows.map((row) => row.date));
  const pivotMap = new Map<string, PivotedRow>();

  rows.forEach((row) => {
    const pivoted = pivotMap.get(row.date) ?? {
      date: new Date(`${row.date}T00:00:00Z`),
      dateKey: row.date,
    };
    pivoted[row.contributor] = row.commits;
    pivotMap.set(row.date, pivoted);
  });

  const data = Array.from(dateSet)
    .sort()
    .map((date) => {
      const base = pivotMap.get(date) ?? {
        date: new Date(`${date}T00:00:00Z`),
        dateKey: date,
      };
      contributors.forEach((contributor) => {
        base[contributor] = Number(base[contributor] ?? 0);
      });
      return base;
    });

  return { contributors, data };
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

function offsetDate(date: Date, granularity: Granularity, direction: -1 | 1) {
  const next = new Date(date);
  if (granularity === 'month') {
    next.setUTCMonth(next.getUTCMonth() + direction);
  } else if (granularity === 'week') {
    next.setUTCDate(next.getUTCDate() + direction * 7);
  } else {
    next.setUTCDate(next.getUTCDate() + direction);
  }
  return next;
}

function padSparsePivotData(data: PivotedRow[], contributors: string[], granularity: Granularity) {
  if (data.length !== 1) {
    return data;
  }

  const only = data[0];
  const makeBoundary = (date: Date): PivotedRow => {
    const boundary: PivotedRow = {
      date,
      dateKey: toIsoDate(date),
    };
    contributors.forEach((contributor) => {
      boundary[contributor] = 0;
    });
    return boundary;
  };

  return [
    makeBoundary(offsetDate(only.date, granularity, -1)),
    only,
    makeBoundary(offsetDate(only.date, granularity, 1)),
  ];
}

function clamp(value: number, minValue: number, maxValue: number) {
  return Math.max(minValue, Math.min(maxValue, value));
}

function getTickData(data: PivotedRow[]) {
  if (data.length <= 6) {
    return data;
  }
  const step = Math.max(1, Math.ceil(data.length / 6));
  return data.filter((_, index) => index === 0 || index === data.length - 1 || index % step === 0);
}

function formatChartDate(dateKey: string, granularity: Granularity) {
  if (granularity === 'month') return dateKey.slice(0, 7);
  if (granularity === 'week') return `${dateKey.slice(5).replace('-', '.')}`;
  return dateKey.slice(5).replace('-', '.');
}

function ProjectRiverStreamgraph({
  colorMap,
  eventMarkers,
  granularity,
  highlightedContributor,
  onHoverContributor,
  onHoverEvent,
  onRangeChange,
  rows,
  t,
  visibleRange,
}: {
  colorMap: Map<string, string>;
  eventMarkers: ProjectEventMarker[];
  granularity: Granularity;
  highlightedContributor: string | null;
  onHoverContributor: (payload: StreamgraphTooltipState | null) => void;
  onHoverEvent: (event: ProjectEventMarker | null) => void;
  onRangeChange: (range: VisibleRange | null) => void;
  rows: DailyRow[];
  t: (key: string, params?: Record<string, string>) => string;
  visibleRange: VisibleRange | null;
}) {
  const { contributors, data: rawData } = useMemo(() => pivotDailyData(rows), [rows]);
  const data = useMemo(
    () => padSparsePivotData(rawData, contributors, granularity),
    [contributors, granularity, rawData],
  );
  const [hoveredMarkerId, setHoveredMarkerId] = useState<string | null>(null);
  const [hoverGuide, setHoverGuide] = useState<{ x: number; y: number } | null>(null);
  const brushDragRef = useRef<{
    initialEnd: number;
    initialStart: number;
    mode: 'start' | 'end' | 'move' | 'new';
    startX: number;
  } | null>(null);
  const layers = useMemo(() => {
    if (contributors.length === 0 || data.length === 0) return [];
    return stack<PivotedRow>()
      .keys(contributors)
      .order(stackOrderInsideOut)
      .offset(stackOffsetWiggle)(data);
  }, [contributors, data]);

  const chartHeight = STREAM_HEIGHT - STREAM_MARGIN.top - STREAM_MARGIN.bottom - BRUSH_HEIGHT - BRUSH_GAP;
  const brushTop = STREAM_HEIGHT - BRUSH_HEIGHT;
  const xDomain = extent(data, (datum) => datum.date);
  const fullDomainStart = xDomain[0] ?? new Date();
  const fullDomainEnd = xDomain[1] ?? offsetDate(fullDomainStart, granularity, 1);
  const chartLeft = STREAM_MARGIN.left;
  const chartRight = STREAM_WIDTH - STREAM_MARGIN.right;
  const baseXScale = scaleUtc()
    .domain([fullDomainStart, fullDomainEnd])
    .range([chartLeft, chartRight]);
  const visibleStart = visibleRange ? new Date(`${visibleRange.start}T00:00:00Z`) : fullDomainStart;
  const visibleEnd = visibleRange ? new Date(`${visibleRange.end}T00:00:00Z`) : fullDomainEnd;
  const hasValidVisibleRange =
    visibleRange &&
    Number.isFinite(visibleStart.getTime()) &&
    Number.isFinite(visibleEnd.getTime()) &&
    visibleStart < fullDomainEnd &&
    visibleEnd > fullDomainStart &&
    visibleStart < visibleEnd;
  const visibleDomainStart = hasValidVisibleRange && visibleStart > fullDomainStart ? visibleStart : fullDomainStart;
  const visibleDomainEnd = hasValidVisibleRange && visibleEnd < fullDomainEnd ? visibleEnd : fullDomainEnd;
  const yMin = min(layers, (layer) => min(layer, (point) => point[0])) ?? 0;
  const yMax = max(layers, (layer) => max(layer, (point) => point[1])) ?? 1;
  const ySpan = yMax - yMin || 1;
  const xScale = scaleUtc()
    .domain([visibleDomainStart, visibleDomainEnd])
    .range([chartLeft, chartRight]);
  const yScale = scaleLinear()
    .domain([yMin - ySpan * 0.08, yMax + ySpan * 0.08])
    .range([STREAM_MARGIN.top + chartHeight, STREAM_MARGIN.top]);
  const brushYScale = scaleLinear()
    .domain([yMin - ySpan * 0.08, yMax + ySpan * 0.08])
    .range([STREAM_HEIGHT - 8, brushTop + 8]);
  const getMainY1 = (point: [number, number]) => Math.min(yScale(point[1]), yScale(point[0]) - 2);
  const getBrushY1 = (point: [number, number]) => Math.min(brushYScale(point[1]), brushYScale(point[0]) - 1);
  const areaGenerator = area<[number, number]>()
    .x((_, index) => xScale(data[index]?.date ?? new Date()))
    .y0((point) => yScale(point[0]))
    .y1((point) => getMainY1(point))
    .curve(curveBasis);
  const brushAreaGenerator = area<[number, number]>()
    .x((_, index) => baseXScale(data[index]?.date ?? new Date()))
    .y0((point) => brushYScale(point[0]))
    .y1((point) => getBrushY1(point))
    .curve(curveBasis);
  const dateTotals = new Map<string, number>();
  rows.forEach((row) => {
    dateTotals.set(row.date, (dateTotals.get(row.date) ?? 0) + row.commits);
  });
  const markerByDate = new Map<string, ProjectEventMarker[]>();
  eventMarkers.forEach((marker) => {
    if (!marker.selected) return;
    const list = markerByDate.get(marker.date) ?? [];
    list.push(marker);
    markerByDate.set(marker.date, list);
  });
  const tickData = getTickData(data);
  const yTicks = yScale.ticks(5);
  const spikeDates = Array.from(dateTotals.entries())
    .filter(([, total]) => total > 0)
    .sort((left, right) => right[1] - left[1])
    .slice(0, MAX_SPIKE_MARKERS)
    .map(([date]) => date);
  const contributorLabels = layers
    .map((layer) => {
      let bestIndex = 0;
      let maxThickness = 0;
      layer.forEach((point, index) => {
        const thickness = Math.abs(yScale(point[0]) - yScale(point[1]));
        if (thickness > maxThickness) {
          maxThickness = thickness;
          bestIndex = index;
        }
      });
      const point = layer[bestIndex];
      return {
        contributor: layer.key,
        maxThickness,
        x: xScale(data[bestIndex]?.date ?? new Date()),
        y: point ? (yScale(point[0]) + getMainY1(point)) / 2 : STREAM_MARGIN.top,
      };
    })
    .filter((label) => label.maxThickness >= 16)
    .sort((left, right) => right.maxThickness - left.maxThickness)
    .slice(0, MAX_CONTRIBUTOR_LABELS);

  const handleLayerHover = (
    event: React.MouseEvent<SVGPathElement>,
    layer: (readonly [number, number])[] & { key: string },
  ) => {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const viewX = ((event.clientX - rect.left) / rect.width) * STREAM_WIDTH;
    const hoveredDate = xScale.invert(viewX);
    const targetTime = hoveredDate.getTime();
    let nearestIndex = 0;
    let nearestDelta = Number.POSITIVE_INFINITY;
    data.forEach((datum, index) => {
      const delta = Math.abs(datum.date.getTime() - targetTime);
      if (delta < nearestDelta) {
        nearestDelta = delta;
        nearestIndex = index;
      }
    });

    const point = layer[nearestIndex];
    const dateKey = data[nearestIndex]?.dateKey ?? '';
    const commits = Number(data[nearestIndex]?.[layer.key] ?? 0);
    const totalCommits = dateTotals.get(dateKey) ?? commits;
    const y = point ? (yScale(point[0]) + getMainY1(point)) / 2 : STREAM_MARGIN.top;
    setHoverGuide({ x: xScale(data[nearestIndex]?.date ?? new Date()), y });
    onHoverContributor({
      contributor: layer.key,
      date: dateKey,
      commits,
      totalCommits,
      percentage: totalCommits > 0 ? Math.round((commits / totalCommits) * 100) : 0,
      x: 18,
      y: 18,
    });
  };
  const getViewX = (event: React.PointerEvent<SVGRectElement>) => {
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return chartLeft;
    const rect = svg.getBoundingClientRect();
    return clamp(((event.clientX - rect.left) / rect.width) * STREAM_WIDTH, chartLeft, chartRight);
  };
  const brushStartPx = clamp(
    hasValidVisibleRange ? baseXScale(visibleDomainStart) : chartLeft,
    chartLeft,
    chartRight,
  );
  const brushEndPx = clamp(
    hasValidVisibleRange ? baseXScale(visibleDomainEnd) : chartRight,
    chartLeft,
    chartRight,
  );
  const updateRangeFromPixels = (nextStartPx: number, nextEndPx: number) => {
    const minSpan = 14;
    let startPx = clamp(Math.min(nextStartPx, nextEndPx), chartLeft, chartRight);
    let endPx = clamp(Math.max(nextStartPx, nextEndPx), chartLeft, chartRight);
    if (endPx - startPx < minSpan) {
      const center = clamp((startPx + endPx) / 2, chartLeft + minSpan / 2, chartRight - minSpan / 2);
      startPx = center - minSpan / 2;
      endPx = center + minSpan / 2;
    }
    const start = toIsoDate(baseXScale.invert(startPx));
    const end = toIsoDate(baseXScale.invert(endPx));
    onRangeChange({ start, end });
  };
  const handleBrushPointerDown = (event: React.PointerEvent<SVGRectElement>) => {
    const x = getViewX(event);
    const handleThreshold = 12;
    const selectionStart = Math.min(brushStartPx, brushEndPx);
    const selectionEnd = Math.max(brushStartPx, brushEndPx);
    let mode: 'start' | 'end' | 'move' | 'new' = 'new';
    if (Math.abs(x - selectionStart) <= handleThreshold) {
      mode = 'start';
    } else if (Math.abs(x - selectionEnd) <= handleThreshold) {
      mode = 'end';
    } else if (x > selectionStart && x < selectionEnd) {
      mode = 'move';
    }
    brushDragRef.current = {
      initialEnd: selectionEnd,
      initialStart: selectionStart,
      mode,
      startX: x,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (mode === 'new') {
      updateRangeFromPixels(x, x);
    }
  };
  const handleBrushPointerMove = (event: React.PointerEvent<SVGRectElement>) => {
    const drag = brushDragRef.current;
    if (!drag) return;
    const x = getViewX(event);
    if (drag.mode === 'start') {
      updateRangeFromPixels(x, drag.initialEnd);
      return;
    }
    if (drag.mode === 'end') {
      updateRangeFromPixels(drag.initialStart, x);
      return;
    }
    if (drag.mode === 'new') {
      updateRangeFromPixels(drag.startX, x);
      return;
    }
    const width = drag.initialEnd - drag.initialStart;
    const delta = x - drag.startX;
    const nextStart = clamp(drag.initialStart + delta, chartLeft, chartRight - width);
    updateRangeFromPixels(nextStart, nextStart + width);
  };
  const handleBrushPointerUp = (event: React.PointerEvent<SVGRectElement>) => {
    brushDragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const clipId = 'repo-pulse-project-river-clip';
  const revealId = 'repo-pulse-project-river-reveal';
  const highlightedLayer = highlightedContributor
    ? layers.find((layer) => layer.key === highlightedContributor)
    : null;

  if (rows.length === 0) {
    return (
      <div className="flex h-full min-h-[420px] items-center justify-center px-6 text-center">
        <div>
          <p className="text-sm font-medium text-foreground">{t('projectRiver.empty.noCommitData')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('projectRiver.empty.noCommitHint')}</p>
        </div>
      </div>
    );
  }

  return (
    <svg
      className="h-full min-h-[420px] w-full"
      role="img"
      viewBox={`0 0 ${STREAM_WIDTH} ${STREAM_HEIGHT}`}
      onMouseLeave={() => {
        setHoverGuide(null);
        onHoverContributor(null);
      }}
    >
      <style>
        {`
          .project-river-reveal-rect {
            transform-box: fill-box;
            transform-origin: left center;
            animation: project-river-reveal 760ms cubic-bezier(.22,1,.36,1) both;
          }
          .project-river-layer {
            transition: opacity 160ms ease, filter 160ms ease;
          }
          .project-river-layer:hover {
            filter: saturate(1.18) brightness(1.05);
          }
          .project-river-highlight {
            filter: drop-shadow(0 0 8px color-mix(in srgb, hsl(var(--primary)) 42%, transparent));
            transition: opacity 120ms ease;
          }
          @keyframes project-river-reveal {
            from { transform: scaleX(0); opacity: .2; }
            to { transform: scaleX(1); opacity: 1; }
          }
          @media (prefers-reduced-motion: reduce) {
            .project-river-reveal-rect { animation: none; }
          }
        `}
      </style>
      <defs>
        <clipPath id={clipId}>
          <rect
            height={chartHeight + STREAM_MARGIN.top}
            width={STREAM_WIDTH - STREAM_MARGIN.left - STREAM_MARGIN.right}
            x={STREAM_MARGIN.left}
            y={0}
          />
        </clipPath>
        <clipPath id={revealId}>
          <rect
            className="project-river-reveal-rect"
            height={STREAM_HEIGHT}
            width={STREAM_WIDTH}
            x={0}
            y={0}
          />
        </clipPath>
      </defs>
      <rect fill="transparent" height={STREAM_HEIGHT} width={STREAM_WIDTH} />
      <g>
        {yTicks.map((tick) => {
          const y = yScale(tick);
          return (
            <g key={tick}>
              <line
                stroke="hsl(var(--border))"
                strokeDasharray="4 6"
                strokeOpacity={0.28}
                x1={STREAM_MARGIN.left}
                x2={STREAM_WIDTH - STREAM_MARGIN.right}
                y1={y}
                y2={y}
              />
              <text
                fill="hsl(var(--muted-foreground))"
                fontSize={10}
                textAnchor="end"
                x={STREAM_MARGIN.left - 8}
                y={y + 4}
              >
                {Math.round(tick)}
              </text>
            </g>
          );
        })}
      </g>
      <g clipPath={`url(#${clipId})`}>
        <g clipPath={`url(#${revealId})`}>
          {spikeDates.map((date) => (
            <line
              key={date}
              stroke="hsl(var(--primary))"
              strokeDasharray="2 5"
              strokeOpacity={0.22}
              x1={xScale(new Date(`${date}T00:00:00Z`))}
              x2={xScale(new Date(`${date}T00:00:00Z`))}
              y1={STREAM_MARGIN.top}
              y2={STREAM_MARGIN.top + chartHeight}
            />
          ))}
          {layers.map((layer, index) => {
            const isDimmed = Boolean(highlightedContributor && highlightedContributor !== layer.key);
            return (
              <path
                key={layer.key}
                className="project-river-layer"
                d={areaGenerator(layer as unknown as [number, number][]) ?? undefined}
                fill={colorMap.get(layer.key) ?? 'hsl(var(--muted-foreground))'}
                opacity={isDimmed ? 0.16 : 0.9}
                stroke="none"
                style={{ animationDelay: `${index * 24}ms` }}
                onMouseMove={(event) => handleLayerHover(event, layer)}
              />
            );
          })}
        </g>
        {highlightedLayer ? (
          <path
            className="project-river-highlight"
            d={areaGenerator(highlightedLayer as unknown as [number, number][]) ?? undefined}
            fill="none"
            opacity={0.92}
            pointerEvents="none"
            stroke="hsl(var(--foreground))"
            strokeWidth={2}
          />
        ) : null}
      </g>
      {hoverGuide ? (
        <g pointerEvents="none">
          <line
            stroke="hsl(var(--muted-foreground))"
            strokeDasharray="4 4"
            strokeOpacity={0.55}
            x1={STREAM_MARGIN.left}
            x2={STREAM_WIDTH - STREAM_MARGIN.right}
            y1={hoverGuide.y}
            y2={hoverGuide.y}
          />
          <line
            stroke="hsl(var(--primary))"
            strokeDasharray="3 5"
            strokeOpacity={0.52}
            x1={hoverGuide.x}
            x2={hoverGuide.x}
            y1={STREAM_MARGIN.top}
            y2={STREAM_MARGIN.top + chartHeight}
          />
        </g>
      ) : null}
      <g clipPath={`url(#${clipId})`}>
        {Array.from(markerByDate.entries()).map(([date, markers], index) => {
          const x = xScale(new Date(`${date}T00:00:00Z`));
          const y = STREAM_MARGIN.top + 8 + (index % 3) * 15;
          const marker = markers[0];
          return (
            <g
              key={`${date}-${marker.id}`}
              className="cursor-pointer"
              onMouseEnter={() => {
                setHoveredMarkerId(marker.id);
                onHoverEvent(marker);
              }}
              onMouseLeave={() => {
                setHoveredMarkerId(null);
                onHoverEvent(null);
              }}
            >
              <line
                stroke="hsl(var(--primary))"
                strokeDasharray="2 5"
                strokeOpacity={hoveredMarkerId === marker.id ? 0.8 : 0.42}
                x1={x}
                x2={x}
                y1={STREAM_MARGIN.top}
                y2={STREAM_MARGIN.top + chartHeight}
              />
              <circle
                className={cn(
                  'fill-[var(--github-info)]',
                  marker.severity === 'positive' && 'fill-[var(--github-success)]',
                  marker.severity === 'warning' && 'fill-[var(--github-warning)]',
                )}
                r={hoveredMarkerId === marker.id ? 5 : 3.5}
                stroke="hsl(var(--background))"
                strokeWidth={2}
                cx={x}
                cy={y}
              />
              {markers.length > 1 ? (
                <text fill="hsl(var(--muted-foreground))" fontSize={9} x={x + 6} y={y + 3}>
                  {markers.length}
                </text>
              ) : null}
            </g>
          );
        })}
      </g>
      <g clipPath={`url(#${clipId})`}>
        {contributorLabels.map((label) => (
          <text
            key={label.contributor}
            fill="hsl(var(--background))"
            fontSize={11}
            fontWeight={700}
            opacity={highlightedContributor && highlightedContributor !== label.contributor ? 0.24 : 0.78}
            pointerEvents="none"
            textAnchor="middle"
            x={label.x}
            y={label.y + 4}
          >
            {contributorLabel(label.contributor, t)}
          </text>
        ))}
      </g>
      <g>
        {tickData.map((datum) => (
          <text
            key={datum.dateKey}
            fill="hsl(var(--muted-foreground))"
            fontSize={10}
            textAnchor="middle"
            x={xScale(datum.date)}
            y={STREAM_MARGIN.top + chartHeight + 18}
          >
            {formatChartDate(datum.dateKey, granularity)}
          </text>
        ))}
      </g>
      <line
        stroke="hsl(var(--border))"
        strokeOpacity={0.45}
        x1={STREAM_MARGIN.left}
        x2={STREAM_WIDTH - STREAM_MARGIN.right}
        y1={brushTop - BRUSH_GAP / 2}
        y2={brushTop - BRUSH_GAP / 2}
      />
      <rect
        fill="hsl(var(--secondary))"
        fillOpacity={0.38}
        height={BRUSH_HEIGHT - 8}
        rx={5}
        width={STREAM_WIDTH - STREAM_MARGIN.left - STREAM_MARGIN.right}
        x={STREAM_MARGIN.left}
        y={brushTop + 4}
      />
      <g opacity={0.45}>
        {layers.map((layer) => (
          <path
            key={`brush-${layer.key}`}
            d={brushAreaGenerator(layer as unknown as [number, number][]) ?? undefined}
            fill={colorMap.get(layer.key) ?? 'hsl(var(--muted-foreground))'}
            stroke="none"
          />
        ))}
      </g>
      <rect
        fill="hsl(var(--primary))"
        fillOpacity={0.16}
        height={BRUSH_HEIGHT - 8}
        rx={4}
        stroke="hsl(var(--primary))"
        strokeOpacity={0.65}
        width={Math.max(brushEndPx - brushStartPx, 3)}
        x={brushStartPx}
        y={brushTop + 4}
      />
      {[brushStartPx, brushEndPx].map((x, index) => (
        <g key={`${x}-${index}`} pointerEvents="none">
          <rect
            fill="hsl(var(--muted-foreground))"
            height={BRUSH_HEIGHT}
            opacity={0.95}
            rx={2}
            width={6}
            x={x - 3}
            y={brushTop}
          />
          {[brushTop + 18, brushTop + 25, brushTop + 32].map((cy) => (
            <circle
              key={cy}
              cx={x}
              cy={cy}
              fill="hsl(var(--background))"
              opacity={0.55}
              r={0.9}
            />
          ))}
        </g>
      ))}
      <rect
        className="cursor-ew-resize"
        fill="transparent"
        height={BRUSH_HEIGHT}
        width={STREAM_WIDTH - STREAM_MARGIN.left - STREAM_MARGIN.right}
        x={STREAM_MARGIN.left}
        y={brushTop}
        onDoubleClick={() => onRangeChange(null)}
        onPointerDown={handleBrushPointerDown}
        onPointerMove={handleBrushPointerMove}
        onPointerUp={handleBrushPointerUp}
      />
    </svg>
  );
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
  const eventTypes = useMemo(
    () => Array.from(new Set(baseProjectEvents.map((event) => event.type))).sort(),
    [baseProjectEvents],
  );
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
          {repository?.url ? (
            <Button asChild variant="outline" size="sm" className="gap-2">
              <a href={repository.url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                {t('projectRiver.openGithub')}
              </a>
            </Button>
          ) : null}
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

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
          <div className="relative min-h-[420px] flex-[1.15] overflow-hidden border-b border-border bg-card">
              <ProjectRiverStreamgraph
                colorMap={colorMap}
                eventMarkers={projectEvents}
                granularity={granularity}
                highlightedContributor={hoveredContributor}
                onHoverContributor={(payload) => {
                  setStreamTooltip(payload);
                  setHoveredContributor(payload?.contributor ?? null);
                }}
                onHoverEvent={setHoveredEvent}
                onRangeChange={setVisibleRange}
                rows={aggregatedRows}
                t={t}
                visibleRange={visibleRange}
              />
              {streamTooltip ? (
                <div className="pointer-events-none absolute left-4 top-4 z-20 min-w-44 rounded-lg border border-border bg-background/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
                  <div className="flex items-center justify-between gap-3">
                    <span className="max-w-40 truncate font-semibold text-foreground">
                      {contributorLabel(streamTooltip.contributor, t)}
                    </span>
                    <span className="text-[var(--github-info)]">{streamTooltip.percentage}%</span>
                  </div>
                  <p className="mt-1 text-muted-foreground">{streamTooltip.date}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <span className="text-muted-foreground">{t('projectRiver.tooltip.commits')}</span>
                    <span className="text-right font-medium text-foreground">{streamTooltip.commits}</span>
                    <span className="text-muted-foreground">{t('projectRiver.tooltip.total')}</span>
                    <span className="text-right font-medium text-foreground">{streamTooltip.totalCommits}</span>
                  </div>
                </div>
              ) : null}
              {hoveredEvent ? (
                <div className="pointer-events-none absolute right-4 top-4 z-20 max-w-xs rounded-lg border border-border bg-background/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
                  <div className="flex items-center gap-2">
                    <span className={cn('h-2 w-2 rounded-full', severityClass(hoveredEvent.severity))} />
                    <span className="font-semibold text-foreground">{eventTypeLabel(hoveredEvent.type, t)}</span>
                  </div>
                  <p className="mt-1 truncate text-muted-foreground">{hoveredEvent.title}</p>
                  <p className="mt-1 line-clamp-2 text-muted-foreground">{hoveredEvent.description}</p>
                  <p className="mt-1 text-muted-foreground">{hoveredEvent.date}</p>
                </div>
              ) : null}
          </div>

          <section className="flex min-h-[260px] flex-[0.85] flex-col overflow-hidden bg-card">
            <div className="border-b border-border px-4 py-3">
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
            <div className="max-h-[210px] min-h-[150px] shrink-0 overflow-y-auto border-b border-border">
              {visibleEvents.length > 0 ? visibleEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex cursor-default items-start gap-3 border-b border-border/60 px-4 py-3 last:border-b-0 hover:bg-secondary/60"
                  onMouseEnter={() => setHoveredEvent(event)}
                  onMouseLeave={() => setHoveredEvent(null)}
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

            <div className="border-b border-border px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GitPullRequest className="h-4 w-4 text-primary" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-foreground">
                    {selectedYear ?? t('projectRiver.allHistory')}
                  </p>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3">
                <div>
                  <p className="text-[10px] text-muted-foreground">{t('projectRiver.commits')}</p>
                  <p className="text-xl font-semibold tabular-nums text-foreground">{commitTotal}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">{t('projectRiver.activeContributors')}</p>
                  <p className="text-xl font-semibold tabular-nums text-foreground">
                    {contributors.filter((contributor) => contributor.monthlyCommits > 0).length}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">{t('projectRiver.activeDays')}</p>
                  <p className="text-xl font-semibold tabular-nums text-foreground">
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
          </section>
        </div>
      </div>
    </div>
  );
}
