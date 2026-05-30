export interface ProjectRiverDailyRow {
  date: string;
  contributor: string;
  commits: number;
  linesAdded: number;
  linesDeleted: number;
  filesTouched: number;
  cumulativeCommits: number;
}

export type ProjectRiverKeyNodeType =
  | 'contributor_first_commit'
  | 'contributor_exit'
  | 'activity_spike'
  | 'activity_drop'
  | 'major_refactor'
  | 'commit_milestone'
  | 'project_start'
  | 'project_archived';

export type ProjectRiverSeverity = 'info' | 'positive' | 'warning';

export interface ProjectRiverKeyNode {
  id: string;
  type: ProjectRiverKeyNodeType;
  date: string;
  severity: ProjectRiverSeverity;
  priority?: number;
  impactScore: number;
  titleKey: string;
  descriptionKey: string;
  params: Record<string, string | number>;
  contributors?: string[];
}

export interface ProjectRiverDetectionConfig {
  contributorExitThresholdCommits: number;
  contributorExitGapDays: number;
  firstCommitThreshold: number;
  activitySpikeZScore: number;
  activityDropZScore: number;
  activityDropConsecutiveDays: number;
  slidingWindowDays: number;
  minDataDaysForMutation: number;
  refactorDeletionMultiplier: number;
  refactorCooldownDays: number;
  commitMilestones: number[];
  enabledRules: ProjectRiverKeyNodeType[];
}

const defaultConfig: ProjectRiverDetectionConfig = {
  contributorExitThresholdCommits: 50,
  contributorExitGapDays: 60,
  firstCommitThreshold: 8,
  activitySpikeZScore: 3.5,
  activityDropZScore: 2,
  activityDropConsecutiveDays: 7,
  slidingWindowDays: 30,
  minDataDaysForMutation: 14,
  refactorDeletionMultiplier: 8,
  refactorCooldownDays: 30,
  commitMilestones: [100, 500, 1000, 5000, 10000],
  enabledRules: [
    'contributor_first_commit',
    'contributor_exit',
    'activity_spike',
    'activity_drop',
    'major_refactor',
    'commit_milestone',
    'project_start',
    'project_archived',
  ],
};

interface DayStat {
  date: string;
  totalCommits: number;
  totalLinesDeleted: number;
  contributorCount: number;
}

function buildDayStats(dailyData: ProjectRiverDailyRow[]): DayStat[] {
  const map = new Map<string, DayStat>();

  for (const row of dailyData) {
    const stat = map.get(row.date) ?? {
      date: row.date,
      totalCommits: 0,
      totalLinesDeleted: 0,
      contributorCount: 0,
    };
    stat.totalCommits += row.commits;
    stat.totalLinesDeleted += row.linesDeleted;
    stat.contributorCount += 1;
    map.set(row.date, stat);
  }

  return Array.from(map.values()).sort((left, right) => left.date.localeCompare(right.date));
}

function computeSlidingWindow(
  dayStats: DayStat[],
  windowSize: number,
  field: 'totalCommits' | 'totalLinesDeleted',
): Array<{ date: string; mean: number; std: number }> {
  return dayStats.map((stat, index) => {
    const start = Math.max(0, index - windowSize + 1);
    const window = dayStats.slice(start, index + 1);
    const mean = window.reduce((sum, day) => sum + day[field], 0) / window.length;
    const variance =
      window.reduce((sum, day) => sum + (day[field] - mean) ** 2, 0) / window.length;

    return {
      date: stat.date,
      mean,
      std: Math.sqrt(variance),
    };
  });
}

function daysBetween(start: string, end: string): number {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return Number.NaN;
  }
  return Math.floor((endDate.getTime() - startDate.getTime()) / 86400000);
}

function detectContributorEvents(
  dailyData: ProjectRiverDailyRow[],
  config: ProjectRiverDetectionConfig,
  latestDate: string,
  projectStale: boolean,
): ProjectRiverKeyNode[] {
  const events: ProjectRiverKeyNode[] = [];
  const contributorMap = new Map<
    string,
    { firstDate: string; lastDate: string; totalCommits: number }
  >();

  for (const row of dailyData) {
    const existing = contributorMap.get(row.contributor);
    if (!existing) {
      contributorMap.set(row.contributor, {
        firstDate: row.date,
        lastDate: row.date,
        totalCommits: row.commits,
      });
      continue;
    }

    existing.firstDate = row.date < existing.firstDate ? row.date : existing.firstDate;
    existing.lastDate = row.date > existing.lastDate ? row.date : existing.lastDate;
    existing.totalCommits += row.commits;
  }

  for (const [name, info] of contributorMap) {
    if (
      config.enabledRules.includes('contributor_first_commit') &&
      info.totalCommits >= config.firstCommitThreshold
    ) {
      events.push({
        id: `first:${name}`,
        type: 'contributor_first_commit',
        date: info.firstDate,
        severity: 'positive',
        impactScore: info.totalCommits,
        titleKey: 'events.title.contributor_first_commit',
        descriptionKey: 'events.desc.contributor_first_commit',
        params: { name, commits: info.totalCommits },
        contributors: [name],
      });
    }

    if (!config.enabledRules.includes('contributor_exit')) {
      continue;
    }

    const gap = daysBetween(info.lastDate, latestDate);
    if (
      info.totalCommits >= config.contributorExitThresholdCommits &&
      gap >= config.contributorExitGapDays &&
      !projectStale
    ) {
      events.push({
        id: `exit:${name}`,
        type: 'contributor_exit',
        date: info.lastDate,
        severity: 'warning',
        impactScore: info.totalCommits,
        titleKey: 'events.title.contributor_exit',
        descriptionKey: 'events.desc.contributor_exit',
        params: { name, days: gap, commits: info.totalCommits },
        contributors: [name],
      });
    }
  }

  return events;
}

function detectActivityMutations(
  dayStats: DayStat[],
  config: ProjectRiverDetectionConfig,
): ProjectRiverKeyNode[] {
  const events: ProjectRiverKeyNode[] = [];
  if (dayStats.length < config.minDataDaysForMutation) {
    return events;
  }

  const sliding = computeSlidingWindow(dayStats, config.slidingWindowDays, 'totalCommits');

  if (config.enabledRules.includes('activity_spike')) {
    let inSpike = false;
    for (let index = 0; index < dayStats.length; index += 1) {
      const { mean, std } = sliding[index];
      if (std === 0) {
        continue;
      }

      const zScore = (dayStats[index].totalCommits - mean) / std;
      if (zScore > config.activitySpikeZScore) {
        if (!inSpike) {
          events.push({
            id: `spike:${dayStats[index].date}`,
            type: 'activity_spike',
            date: dayStats[index].date,
            severity: 'info',
            impactScore: zScore,
            titleKey: 'events.title.activity_spike',
            descriptionKey: 'events.desc.activity_spike',
            params: {
              commits: dayStats[index].totalCommits,
              zScore: Number(zScore.toFixed(1)),
            },
          });
          inSpike = true;
        }
      } else {
        inSpike = false;
      }
    }
  }

  if (config.enabledRules.includes('activity_drop')) {
    let consecutiveLow = 0;
    let dropStartIndex = -1;

    for (let index = 0; index < dayStats.length; index += 1) {
      const { mean, std } = sliding[index];
      const isLow =
        std > 0 && (dayStats[index].totalCommits - mean) / std < -config.activityDropZScore;

      if (isLow) {
        if (consecutiveLow === 0) {
          dropStartIndex = index;
        }
        consecutiveLow += 1;
      } else {
        consecutiveLow = 0;
        dropStartIndex = -1;
      }

      if (consecutiveLow === config.activityDropConsecutiveDays && dropStartIndex >= 0) {
        events.push({
          id: `drop:${dayStats[dropStartIndex].date}`,
          type: 'activity_drop',
          date: dayStats[dropStartIndex].date,
          severity: 'warning',
          impactScore: 0,
          titleKey: 'events.title.activity_drop',
          descriptionKey: 'events.desc.activity_drop',
          params: { days: config.activityDropConsecutiveDays },
        });
        consecutiveLow = 0;
        dropStartIndex = -1;
      }
    }
  }

  return events;
}

function detectRefactors(
  dayStats: DayStat[],
  config: ProjectRiverDetectionConfig,
): ProjectRiverKeyNode[] {
  const events: ProjectRiverKeyNode[] = [];
  if (
    !config.enabledRules.includes('major_refactor') ||
    dayStats.length < config.minDataDaysForMutation
  ) {
    return events;
  }

  const sliding = computeSlidingWindow(dayStats, config.slidingWindowDays, 'totalLinesDeleted');
  let lastRefactorDate: string | null = null;

  for (let index = 0; index < dayStats.length; index += 1) {
    const { mean } = sliding[index];
    if (mean === 0) {
      continue;
    }

    const deleted = dayStats[index].totalLinesDeleted;
    if (deleted <= mean * config.refactorDeletionMultiplier) {
      continue;
    }

    if (
      lastRefactorDate &&
      daysBetween(lastRefactorDate, dayStats[index].date) < config.refactorCooldownDays
    ) {
      continue;
    }

    events.push({
      id: `refactor:${dayStats[index].date}`,
      type: 'major_refactor',
      date: dayStats[index].date,
      severity: 'info',
      impactScore: deleted,
      titleKey: 'events.title.major_refactor',
      descriptionKey: 'events.desc.major_refactor',
      params: { lines: deleted },
    });
    lastRefactorDate = dayStats[index].date;
  }

  return events;
}

function detectMilestones(
  dailyData: ProjectRiverDailyRow[],
  config: ProjectRiverDetectionConfig,
  earliestDate: string,
): ProjectRiverKeyNode[] {
  const events: ProjectRiverKeyNode[] = [];

  if (config.enabledRules.includes('project_start')) {
    events.push({
      id: `start:${earliestDate}`,
      type: 'project_start',
      date: earliestDate,
      severity: 'positive',
      impactScore: 0,
      titleKey: 'events.title.project_start',
      descriptionKey: 'events.desc.project_start',
      params: { date: earliestDate },
    });
  }

  if (!config.enabledRules.includes('commit_milestone')) {
    return events;
  }

  const sorted = [...dailyData].sort((left, right) => left.date.localeCompare(right.date));
  let cumulative = 0;
  let milestoneIndex = 0;

  for (const row of sorted) {
    cumulative += row.commits;
    while (
      milestoneIndex < config.commitMilestones.length &&
      cumulative >= config.commitMilestones[milestoneIndex]
    ) {
      const threshold = config.commitMilestones[milestoneIndex];
      events.push({
        id: `milestone:${threshold}`,
        type: 'commit_milestone',
        date: row.date,
        severity: 'positive',
        impactScore: threshold,
        titleKey: 'events.title.commit_milestone',
        descriptionKey: 'events.desc.commit_milestone',
        params: { threshold },
      });
      milestoneIndex += 1;
    }
  }

  return events;
}

function detectProjectArchived(
  config: ProjectRiverDetectionConfig,
  earliestDate: string,
  latestDate: string,
): ProjectRiverKeyNode[] {
  if (!config.enabledRules.includes('project_archived')) {
    return [];
  }

  const today = new Date().toISOString().slice(0, 10);
  const daysSinceLastCommit = daysBetween(latestDate, today);
  const projectDurationDays = daysBetween(earliestDate, latestDate);

  if (daysSinceLastCommit <= 365 || projectDurationDays <= 365) {
    return [];
  }

  return [
    {
      id: 'project_archived',
      type: 'project_archived',
      date: latestDate,
      severity: 'warning',
      impactScore: daysSinceLastCommit,
      titleKey: 'events.title.project_archived',
      descriptionKey: 'events.desc.project_archived',
      params: { lastDate: latestDate, daysSilent: daysSinceLastCommit },
    },
  ];
}

export function detectProjectRiverKeyNodes(
  dailyData: ProjectRiverDailyRow[],
  partialConfig?: Partial<ProjectRiverDetectionConfig>,
): ProjectRiverKeyNode[] {
  if (dailyData.length === 0) {
    return [];
  }

  const config = { ...defaultConfig, ...partialConfig };
  const sortedDates = dailyData.map((row) => row.date).sort();
  const earliestDate = sortedDates[0];
  const latestDate = sortedDates[sortedDates.length - 1];
  const projectStale = daysBetween(latestDate, new Date().toISOString().slice(0, 10)) > 90;
  const dayStats = buildDayStats(dailyData);
  const events = [
    ...detectContributorEvents(dailyData, config, latestDate, projectStale),
    ...detectActivityMutations(dayStats, config),
    ...detectRefactors(dayStats, config),
    ...detectMilestones(dailyData, config, earliestDate),
    ...detectProjectArchived(config, earliestDate, latestDate),
  ];
  const priorityMap: Record<ProjectRiverSeverity, number> = {
    warning: 3,
    positive: 2,
    info: 1,
  };
  const seen = new Set<string>();

  return events
    .map((event) => ({
      ...event,
      priority: priorityMap[event.severity] ?? 1,
    }))
    .sort((left, right) =>
      left.date.localeCompare(right.date) ||
      (right.priority ?? 0) - (left.priority ?? 0) ||
      left.type.localeCompare(right.type),
    )
    .filter((event) => {
      if (seen.has(event.id)) {
        return false;
      }
      seen.add(event.id);
      return true;
    });
}
