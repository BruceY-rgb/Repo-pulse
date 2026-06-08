import {
  calculateHealthStats,
  evaluateHealthRules,
  HealthStatsInput,
} from '../../src/modules/dashboard/health-rules';

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

function makeStats(overrides: Partial<HealthStatsInput> = {}): HealthStatsInput {
  return {
    totalCommits: 0,
    totalContributors: 0,
    topContributors: [],
    lastDate: null,
    recent90DaysCommits: 0,
    prior270DaysDailyAvg: 0,
    avgLinesPerCommit: 0,
    recentQuarterContributors: 0,
    previousQuarterContributors: 0,
    daysSinceLastCommit: null,
    ...overrides,
  };
}

describe('health-rules / calculateHealthStats', () => {
  it('returns zeroed stats for empty input', () => {
    const stats = calculateHealthStats([]);
    expect(stats.totalCommits).toBe(0);
    expect(stats.totalContributors).toBe(0);
    expect(stats.topContributors).toEqual([]);
    expect(stats.lastDate).toBeNull();
    expect(stats.daysSinceLastCommit).toBeNull();
    expect(stats.avgLinesPerCommit).toBe(0);
    expect(stats.prior270DaysDailyAvg).toBe(0);
  });

  it('aggregates commits and contributors with top contributors sorted desc', () => {
    const stats = calculateHealthStats([
      { date: daysAgo(10), contributor: 'alice', commits: 5, linesAdded: 100, linesDeleted: 20 },
      { date: daysAgo(9), contributor: 'bob', commits: 3, linesAdded: 30, linesDeleted: 10 },
      { date: daysAgo(8), contributor: 'alice', commits: 2, linesAdded: 40, linesDeleted: 0 },
    ]);
    expect(stats.totalCommits).toBe(10);
    expect(stats.totalContributors).toBe(2);
    expect(stats.topContributors[0]).toEqual({ contributor: 'alice', commits: 7 });
    expect(stats.topContributors[1]).toEqual({ contributor: 'bob', commits: 3 });
    // avgLinesPerCommit = (100+20+30+10+40+0) / 10 = 20
    expect(stats.avgLinesPerCommit).toBe(20);
  });

  it('counts only recent 90-day commits in recent90DaysCommits', () => {
    const stats = calculateHealthStats([
      { date: daysAgo(5), contributor: 'a', commits: 4, linesAdded: 1, linesDeleted: 1 },
      { date: daysAgo(200), contributor: 'a', commits: 7, linesAdded: 1, linesDeleted: 1 },
    ]);
    expect(stats.recent90DaysCommits).toBe(4);
    expect(stats.totalCommits).toBe(11);
  });

  it('computes prior 270-day daily average over the 90..360 day window', () => {
    const stats = calculateHealthStats([
      { date: daysAgo(120), contributor: 'a', commits: 2, linesAdded: 0, linesDeleted: 0 },
      { date: daysAgo(150), contributor: 'a', commits: 4, linesAdded: 0, linesDeleted: 0 },
    ]);
    // two distinct days in the prior window: (2 + 4) / 2 = 3
    expect(stats.prior270DaysDailyAvg).toBe(3);
  });

  it('tracks the latest commit date and days since last commit', () => {
    const stats = calculateHealthStats([
      { date: daysAgo(30), contributor: 'a', commits: 1, linesAdded: 0, linesDeleted: 0 },
      { date: daysAgo(3), contributor: 'a', commits: 1, linesAdded: 0, linesDeleted: 0 },
    ]);
    expect(stats.lastDate).toBe(daysAgo(3));
    expect(stats.daysSinceLastCommit).toBe(3);
  });
});

describe('health-rules / evaluateHealthRules', () => {
  it('emits no signals for empty stats', () => {
    expect(evaluateHealthRules(makeStats())).toEqual([]);
  });

  it('flags contributor concentration when top 3 exceed 80% of commits', () => {
    const signals = evaluateHealthRules(
      makeStats({
        totalCommits: 100,
        totalContributors: 4,
        topContributors: [
          { contributor: 'a', commits: 50 },
          { contributor: 'b', commits: 25 },
          { contributor: 'c', commits: 10 },
          { contributor: 'd', commits: 15 },
        ],
      }),
    );
    const concentration = signals.find((s) => s.id === 'concentration');
    expect(concentration).toBeDefined();
    expect(concentration?.severity).toBe('warning');
    expect(concentration?.evidenceParams?.pct).toBe('85');
  });

  it('does not flag concentration with fewer than 3 contributors', () => {
    const signals = evaluateHealthRules(
      makeStats({
        totalCommits: 100,
        totalContributors: 2,
        topContributors: [
          { contributor: 'a', commits: 90 },
          { contributor: 'b', commits: 10 },
        ],
      }),
    );
    expect(signals.find((s) => s.id === 'concentration')).toBeUndefined();
  });

  it('flags an activity drop when recent daily average falls below 30% of prior', () => {
    const signals = evaluateHealthRules(
      makeStats({ prior270DaysDailyAvg: 10, recent90DaysCommits: 90 }),
    );
    // recent daily avg = 90/90 = 1, ratio = 1/10 = 0.1 < 0.3
    const drop = signals.find((s) => s.id === 'activity-drop');
    expect(drop).toBeDefined();
    expect(drop?.severity).toBe('warning');
  });

  it('does not flag an activity drop when recent activity is healthy', () => {
    const signals = evaluateHealthRules(
      makeStats({ prior270DaysDailyAvg: 1, recent90DaysCommits: 90 }),
    );
    expect(signals.find((s) => s.id === 'activity-drop')).toBeUndefined();
  });

  it('flags high code churn when average lines per commit exceed 500', () => {
    const signals = evaluateHealthRules(makeStats({ avgLinesPerCommit: 800 }));
    const churn = signals.find((s) => s.id === 'code-churn');
    expect(churn).toBeDefined();
    expect(churn?.evidenceParams?.lines).toBe('800');
  });

  it('flags positive distribution growth quarter over quarter', () => {
    const signals = evaluateHealthRules(
      makeStats({ previousQuarterContributors: 4, recentQuarterContributors: 6 }),
    );
    const growth = signals.find((s) => s.id === 'distribution-growth');
    expect(growth).toBeDefined();
    expect(growth?.severity).toBe('positive');
    expect(growth?.evidenceParams?.pct).toBe('50');
  });

  it('emits sustained-activity with "today" evidence when last commit is within a day', () => {
    const signals = evaluateHealthRules(makeStats({ daysSinceLastCommit: 1 }));
    const sustained = signals.find((s) => s.id === 'sustained-activity');
    expect(sustained).toBeDefined();
    expect(sustained?.evidence).toContain('Today');
    expect(sustained?.evidenceParams).toBeUndefined();
  });

  it('emits sustained-activity with day count when within 30 days', () => {
    const signals = evaluateHealthRules(makeStats({ daysSinceLastCommit: 15 }));
    const sustained = signals.find((s) => s.id === 'sustained-activity');
    expect(sustained).toBeDefined();
    expect(sustained?.evidenceParams?.days).toBe('15');
  });

  it('flags an archived project when last commit is older than a year', () => {
    const signals = evaluateHealthRules(
      makeStats({ daysSinceLastCommit: 400, lastDate: '2024-01-01' }),
    );
    const archived = signals.find((s) => s.id === 'project-archived');
    expect(archived).toBeDefined();
    expect(archived?.severity).toBe('warning');
    expect(archived?.evidenceParams?.daysSilent).toBe('400');
    // archived and sustained-activity are mutually exclusive
    expect(signals.find((s) => s.id === 'sustained-activity')).toBeUndefined();
  });
});
