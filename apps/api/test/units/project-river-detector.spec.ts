import {
  detectProjectRiverKeyNodes,
  ProjectRiverDailyRow,
} from '../../src/modules/dashboard/project-river-detector';

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

function row(overrides: Partial<ProjectRiverDailyRow> & { date: string; contributor: string }): ProjectRiverDailyRow {
  return {
    commits: 1,
    linesAdded: 10,
    linesDeleted: 5,
    filesTouched: 1,
    cumulativeCommits: 0,
    ...overrides,
  };
}

describe('project-river-detector', () => {
  it('returns no key nodes for empty input', () => {
    expect(detectProjectRiverKeyNodes([])).toEqual([]);
  });

  it('always emits a project_start node at the earliest date', () => {
    const nodes = detectProjectRiverKeyNodes([
      row({ date: daysAgo(20), contributor: 'a', commits: 1 }),
      row({ date: daysAgo(10), contributor: 'a', commits: 1 }),
    ]);
    const start = nodes.find((n) => n.type === 'project_start');
    expect(start).toBeDefined();
    expect(start?.date).toBe(daysAgo(20));
    expect(start?.severity).toBe('positive');
  });

  it('emits contributor_first_commit when a contributor passes the commit threshold', () => {
    const nodes = detectProjectRiverKeyNodes([
      row({ date: daysAgo(15), contributor: 'alice', commits: 10 }),
      row({ date: daysAgo(5), contributor: 'bob', commits: 2 }),
    ]);
    const first = nodes.filter((n) => n.type === 'contributor_first_commit');
    expect(first).toHaveLength(1);
    expect(first[0].params.name).toBe('alice');
    expect(first[0].contributors).toEqual(['alice']);
  });

  it('emits commit_milestone nodes as cumulative commits cross thresholds', () => {
    const nodes = detectProjectRiverKeyNodes([
      row({ date: daysAgo(30), contributor: 'a', commits: 60 }),
      row({ date: daysAgo(20), contributor: 'a', commits: 60 }),
    ]);
    const milestone = nodes.find((n) => n.type === 'commit_milestone');
    expect(milestone).toBeDefined();
    expect(milestone?.params.threshold).toBe(100);
  });

  it('emits contributor_exit for a major contributor who stopped before an active head', () => {
    const nodes = detectProjectRiverKeyNodes([
      row({ date: daysAgo(80), contributor: 'leaver', commits: 60 }),
      row({ date: daysAgo(2), contributor: 'active', commits: 5 }),
    ]);
    const exit = nodes.find((n) => n.type === 'contributor_exit');
    expect(exit).toBeDefined();
    expect(exit?.params.name).toBe('leaver');
    expect(exit?.severity).toBe('warning');
  });

  it('suppresses contributor_exit when the whole project is stale', () => {
    const nodes = detectProjectRiverKeyNodes([
      row({ date: daysAgo(500), contributor: 'leaver', commits: 60 }),
      row({ date: daysAgo(200), contributor: 'leaver2', commits: 60 }),
    ]);
    expect(nodes.find((n) => n.type === 'contributor_exit')).toBeUndefined();
  });

  it('detects an activity_spike against the sliding baseline', () => {
    const data: ProjectRiverDailyRow[] = [];
    for (let i = 30; i >= 1; i -= 1) {
      data.push(row({ date: daysAgo(i), contributor: 'a', commits: 1, linesDeleted: 1 }));
    }
    // a sudden burst far above the baseline
    data.push(row({ date: daysAgo(0), contributor: 'a', commits: 200, linesDeleted: 1 }));
    const nodes = detectProjectRiverKeyNodes(data);
    expect(nodes.find((n) => n.type === 'activity_spike')).toBeDefined();
  });

  it('detects a major_refactor when deletions spike above the baseline', () => {
    const data: ProjectRiverDailyRow[] = [];
    for (let i = 30; i >= 1; i -= 1) {
      data.push(row({ date: daysAgo(i), contributor: 'a', commits: 1, linesDeleted: 2 }));
    }
    data.push(row({ date: daysAgo(0), contributor: 'a', commits: 1, linesDeleted: 500 }));
    const nodes = detectProjectRiverKeyNodes(data);
    expect(nodes.find((n) => n.type === 'major_refactor')).toBeDefined();
  });

  it('emits project_archived for a long-lived project that went silent over a year ago', () => {
    const nodes = detectProjectRiverKeyNodes([
      row({ date: daysAgo(900), contributor: 'a', commits: 5 }),
      row({ date: daysAgo(400), contributor: 'a', commits: 5 }),
    ]);
    const archived = nodes.find((n) => n.type === 'project_archived');
    expect(archived).toBeDefined();
    expect(archived?.severity).toBe('warning');
  });

  it('respects enabledRules config and emits nothing when all rules are disabled', () => {
    const nodes = detectProjectRiverKeyNodes(
      [
        row({ date: daysAgo(15), contributor: 'alice', commits: 50 }),
        row({ date: daysAgo(2), contributor: 'bob', commits: 50 }),
      ],
      { enabledRules: [] },
    );
    expect(nodes).toEqual([]);
  });

  it('skips activity-mutation detection when there is too little history', () => {
    const nodes = detectProjectRiverKeyNodes([
      row({ date: daysAgo(3), contributor: 'a', commits: 1 }),
      row({ date: daysAgo(2), contributor: 'a', commits: 100 }),
    ]);
    expect(nodes.find((n) => n.type === 'activity_spike')).toBeUndefined();
  });

  it('returns nodes sorted by date with stable de-duplication', () => {
    const nodes = detectProjectRiverKeyNodes([
      row({ date: daysAgo(30), contributor: 'alice', commits: 60 }),
      row({ date: daysAgo(20), contributor: 'bob', commits: 60 }),
    ]);
    const dates = nodes.map((n) => n.date);
    const sorted = [...dates].sort((a, b) => a.localeCompare(b));
    expect(dates).toEqual(sorted);
    const ids = nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
