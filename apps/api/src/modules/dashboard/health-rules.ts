export interface HealthSignal {
  id: string;
  label: string;
  severity: 'info' | 'warning' | 'positive';
  evidence: string;
  evidenceParams?: Record<string, string | number>;
}

export interface HealthStatsInput {
  totalCommits: number;
  totalContributors: number;
  topContributors: Array<{ contributor: string; commits: number }>;
  lastDate: string | null;
  recent90DaysCommits: number;
  prior270DaysDailyAvg: number;
  avgLinesPerCommit: number;
  recentQuarterContributors: number;
  previousQuarterContributors: number;
  daysSinceLastCommit: number | null;
}

function getYearQuarter(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

function currentQuarter(): string {
  const d = new Date();
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
}

function previousQuarter(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
}

function countContributorsInQuarter(
  rows: Array<{ date: string; contributor: string }>,
  quarter: string,
): number {
  const set = new Set<string>();
  for (const row of rows) {
    if (getYearQuarter(row.date) === quarter) {
      set.add(row.contributor);
    }
  }
  return set.size;
}

export function calculateHealthStats(
  rows: Array<{
    date: string;
    contributor: string;
    commits: number;
    linesAdded: number;
    linesDeleted: number;
  }>,
): HealthStatsInput {
  const now = Date.now();
  const ms90d = 90 * 86400000;
  const ms270d = 270 * 86400000;
  const cutoff90d = now - ms90d;
  const cutoff360d = now - ms90d - ms270d;

  let totalCommits = 0;
  let totalLines = 0;
  let recent90Commits = 0;
  let lastDate: string | null = null;
  let lastDateMs = 0;

  const contributorMap = new Map<string, number>();
  const priorDayTotals = new Map<string, number>();

  for (const row of rows) {
    totalCommits += row.commits;
    totalLines += row.linesAdded + row.linesDeleted;
    contributorMap.set(
      row.contributor,
      (contributorMap.get(row.contributor) || 0) + row.commits,
    );

    const rowMs = new Date(`${row.date}T00:00:00Z`).getTime();

    if (rowMs >= cutoff90d) {
      recent90Commits += row.commits;
    }

    if (rowMs < cutoff90d && rowMs >= cutoff360d) {
      priorDayTotals.set(
        row.date,
        (priorDayTotals.get(row.date) || 0) + row.commits,
      );
    }

    if (rowMs > lastDateMs) {
      lastDateMs = rowMs;
      lastDate = row.date;
    }
  }

  const topContributors = Array.from(contributorMap.entries())
    .map(([contributor, commits]) => ({ contributor, commits }))
    .sort((a, b) => b.commits - a.commits);

  const priorDayValues = Array.from(priorDayTotals.values());
  const prior270DaysDailyAvg =
    priorDayValues.length > 0
      ? priorDayValues.reduce((sum, v) => sum + v, 0) / priorDayValues.length
      : 0;

  const daysSinceLastCommit =
    lastDateMs > 0 ? Math.floor((now - lastDateMs) / 86400000) : null;

  const recentQ = currentQuarter();
  const previousQ = previousQuarter();
  const recentQuarterContributors = countContributorsInQuarter(rows, recentQ);
  const previousQuarterContributors = countContributorsInQuarter(rows, previousQ);

  return {
    totalCommits,
    totalContributors: contributorMap.size,
    topContributors,
    lastDate,
    recent90DaysCommits: recent90Commits,
    prior270DaysDailyAvg,
    avgLinesPerCommit: totalCommits > 0 ? totalLines / totalCommits : 0,
    recentQuarterContributors,
    previousQuarterContributors,
    daysSinceLastCommit,
  };
}

export function evaluateHealthRules(stats: HealthStatsInput): HealthSignal[] {
  const signals: HealthSignal[] = [];

  // Rule 1: Concentration — top 3 > 80% of total commits
  if (stats.totalCommits > 0 && stats.totalContributors >= 3) {
    const top3Commits = stats.topContributors
      .slice(0, 3)
      .reduce((sum, c) => sum + c.commits, 0);
    const concentration = top3Commits / stats.totalCommits;
    if (concentration > 0.8) {
      const top3Names = stats.topContributors
        .slice(0, 3)
        .map((c) => c.contributor)
        .join(', ');
      signals.push({
        id: 'concentration',
        label: 'projectRiver.health.concentration',
        severity: 'warning',
        evidence: 'projectRiver.health.concentrationEvidence',
        evidenceParams: {
          names: top3Names,
          pct: String(Math.round(concentration * 100)),
        },
      });
    }
  }

  // Rule 2: Activity drop — recent 90d daily avg < 30% of prior 270d daily avg
  if (stats.prior270DaysDailyAvg > 0) {
    const recent90DailyAvg = stats.recent90DaysCommits / 90;
    const ratio = recent90DailyAvg / stats.prior270DaysDailyAvg;
    if (ratio < 0.3) {
      signals.push({
        id: 'activity-drop',
        label: 'projectRiver.health.activityDrop',
        severity: 'warning',
        evidence: 'projectRiver.health.activityDropEvidence',
        evidenceParams: {
          avg: recent90DailyAvg.toFixed(1),
          pct: String(Math.round(ratio * 100)),
        },
      });
    }
  }

  // Rule 3: Code churn — avg lines per commit > 500
  if (stats.avgLinesPerCommit > 500) {
    signals.push({
      id: 'code-churn',
      label: 'projectRiver.health.codeChurn',
      severity: 'warning',
      evidence: 'projectRiver.health.codeChurnEvidence',
      evidenceParams: {
        lines: String(Math.round(stats.avgLinesPerCommit)),
      },
    });
  }

  // Rule 4: Distribution growth — quarter-over-quarter contributor growth
  if (
    stats.previousQuarterContributors > 0 &&
    stats.recentQuarterContributors > stats.previousQuarterContributors
  ) {
    const growth = Math.round(
      ((stats.recentQuarterContributors - stats.previousQuarterContributors) /
        stats.previousQuarterContributors) *
        100,
    );
    signals.push({
      id: 'distribution-growth',
      label: 'projectRiver.health.distributionGrowth',
      severity: 'positive',
      evidence: 'projectRiver.health.distributionGrowthEvidence',
      evidenceParams: {
        pct: String(growth),
        prev: String(stats.previousQuarterContributors),
        curr: String(stats.recentQuarterContributors),
      },
    });
  }

  // Rule 5: Sustained activity — recent 30 days has commits
  if (stats.daysSinceLastCommit !== null && stats.daysSinceLastCommit <= 30) {
    signals.push({
      id: 'sustained-activity',
      label: 'projectRiver.health.sustainedActivity',
      severity: 'info',
      evidence:
        stats.daysSinceLastCommit <= 1
          ? 'projectRiver.health.sustainedActivityEvidenceToday'
          : 'projectRiver.health.sustainedActivityEvidence',
      evidenceParams:
        stats.daysSinceLastCommit <= 1
          ? undefined
          : { days: String(stats.daysSinceLastCommit) },
    });
  }

  // Rule 6: Project archived — last commit > 365 days ago
  if (stats.daysSinceLastCommit !== null && stats.daysSinceLastCommit > 365) {
    signals.push({
      id: 'project-archived',
      label: 'projectRiver.health.projectArchived',
      severity: 'warning',
      evidence: 'projectRiver.health.projectArchivedEvidence',
      evidenceParams: {
        lastDate: stats.lastDate ?? '',
        daysSilent: String(stats.daysSinceLastCommit),
      },
    });
  }

  return signals;
}
