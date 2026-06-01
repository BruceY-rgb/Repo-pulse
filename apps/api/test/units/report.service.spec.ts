import { ForbiddenException } from '@nestjs/common';
import { ReportService } from '../../src/modules/report/report.service';

const mockUserRepoFindMany = jest.fn();
const mockUserFindUnique = jest.fn();
const mockEventFindMany = jest.fn();
const mockAnalysisCount = jest.fn();
const mockReportFindUnique = jest.fn();
const mockReportCreate = jest.fn();

jest.mock('@repo-pulse/database', () => ({
  EventType: {
    PUSH: 'PUSH',
    PR_OPENED: 'PR_OPENED',
    PR_MERGED: 'PR_MERGED',
    PR_CLOSED: 'PR_CLOSED',
    ISSUE_OPENED: 'ISSUE_OPENED',
    ISSUE_CLOSED: 'ISSUE_CLOSED',
  },
  ReportType: { WEEKLY: 'WEEKLY', SECURITY: 'SECURITY', TEAM: 'TEAM' },
  ReportFormat: { PDF: 'PDF', MARKDOWN: 'MARKDOWN' },
  ReportStatus: { COMPLETED: 'COMPLETED', PENDING: 'PENDING' },
  RepositoryAccessLevel: { OWNER: 'OWNER', ADMIN: 'ADMIN', MAINTAIN: 'MAINTAIN', WRITE: 'WRITE', TRIAGE: 'TRIAGE', READ: 'READ', NONE: 'NONE' },
  RepositoryAccessMode: { EDITABLE: 'EDITABLE', MONITOR: 'MONITOR' },
  prisma: {
    userRepository: { findMany: (...a: any[]) => mockUserRepoFindMany(...a) },
    user: { findUnique: (...a: any[]) => mockUserFindUnique(...a) },
    event: { findMany: (...a: any[]) => mockEventFindMany(...a) },
    aIAnalysis: { count: (...a: any[]) => mockAnalysisCount(...a) },
    report: {
      findUnique: (...a: any[]) => mockReportFindUnique(...a),
      create: (...a: any[]) => mockReportCreate(...a),
    },
  },
}));

jest.mock('jspdf', () => ({
  jsPDF: jest.fn().mockImplementation(() => ({
    internal: { pageSize: { getWidth: () => 210 } },
    setFontSize: jest.fn(),
    text: jest.fn(),
    splitTextToSize: jest.fn().mockReturnValue(['summary line']),
    addPage: jest.fn(),
    output: jest.fn().mockReturnValue('data:application/pdf;base64,abc'),
  })),
}), { virtual: true });

function makePrefs(overrides: object = {}) {
  return { preferences: overrides };
}

function mockResolveRepos(repoIds: string[], scopeRepoIds?: string[]) {
  mockUserRepoFindMany.mockResolvedValue(repoIds.map((id) => ({ repositoryId: id })));
  if (scopeRepoIds) {
    mockUserFindUnique.mockResolvedValue(makePrefs({ monitoringScope: { repositoryIds: scopeRepoIds } }));
  } else {
    mockUserFindUnique.mockResolvedValue(makePrefs({}));
  }
}

function mockAnalysisCounts(critical = 0, high = 0, medium = 0) {
  mockAnalysisCount
    .mockResolvedValueOnce(critical)
    .mockResolvedValueOnce(high)
    .mockResolvedValueOnce(medium);
}

describe('ReportService', () => {
  let service: ReportService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ReportService();
  });

  // ── getReports — empty repos ───────────────────────────────────────────────
  it('returns empty array when no accessible repositories', async () => {
    mockResolveRepos([]);
    const result = await service.getReports('u1');
    expect(result).toEqual([]);
  });

  // ── getReports — with data ─────────────────────────────────────────────────
  it('returns 3 report items for repos with events', async () => {
    mockResolveRepos(['r1']);
    mockEventFindMany.mockResolvedValue([
      { type: 'PUSH', id: 'e1' },
      { type: 'PR_OPENED', id: 'e2' },
      { type: 'PR_MERGED', id: 'e3' },
      { type: 'ISSUE_OPENED', id: 'e4' },
      { type: 'ISSUE_CLOSED', id: 'e5' },
    ]);
    mockAnalysisCounts(1, 2, 3);

    const result = await service.getReports('u1');
    expect(result).toHaveLength(3);
    expect(result[0].type).toBe('weekly');
    expect(result[1].type).toBe('security');
    expect(result[2].type).toBe('team');
  });

  it('correctly counts metrics in weekly report', async () => {
    mockResolveRepos(['r1']);
    mockEventFindMany.mockResolvedValue([
      { type: 'PUSH', id: 'e1' },
      { type: 'PUSH', id: 'e2' },
      { type: 'PR_OPENED', id: 'e3' },
      { type: 'ISSUE_OPENED', id: 'e4' },
      { type: 'ISSUE_CLOSED', id: 'e5' },
      { type: 'PR_MERGED', id: 'e6' },
    ]);
    mockAnalysisCounts(0, 0, 0);

    const result = await service.getReports('u1');
    const weekly = result[0];
    expect(weekly.metrics).toMatchObject({ commits: 2, prs: 2, issues: 2, resolved: 2 });
  });

  it('sets avgCommitsPerPR to 0 when no PRs', async () => {
    mockResolveRepos(['r1']);
    mockEventFindMany.mockResolvedValue([
      { type: 'PUSH', id: 'e1' },
    ]);
    mockAnalysisCounts(0, 0, 0);

    const result = await service.getReports('u1');
    const teamReport = result[2];
    expect((teamReport.metrics as any).avgCommitsPerPR).toBe(0);
  });

  it('calculates avgCommitsPerPR correctly', async () => {
    mockResolveRepos(['r1']);
    // 6 pushes, 2 PRs (opened + merged) → avg = 3
    mockEventFindMany.mockResolvedValue([
      ...Array(6).fill({ type: 'PUSH', id: 'p' }),
      { type: 'PR_OPENED', id: 'pr1' },
      { type: 'PR_MERGED', id: 'pr2' },
    ]);
    mockAnalysisCounts(0, 0, 0);

    const result = await service.getReports('u1');
    expect((result[2].metrics as any).avgCommitsPerPR).toBe(3);
  });

  // ── getReports — monitoringScope filter ───────────────────────────────────
  it('applies monitoringScope when user has it configured', async () => {
    mockResolveRepos(['r1', 'r2', 'r3'], ['r1', 'r3']);
    mockEventFindMany.mockResolvedValue([]);
    mockAnalysisCounts(0, 0, 0);

    const result = await service.getReports('u1');
    // Should have returned results (r1, r3 in scope)
    expect(result).toHaveLength(3);
    // Verify event query used only r1, r3 (not r2)
    const eventCall = mockEventFindMany.mock.calls[0][0];
    expect(eventCall.where.repositoryId.in).toEqual(['r1', 'r3']);
    expect(eventCall.where.repositoryId.in).not.toContain('r2');
  });

  it('uses all accessible repos when monitoringScope is empty', async () => {
    mockResolveRepos(['r1', 'r2'], []);
    // Empty scopeRepoIds → effectiveIds = []
    const result = await service.getReports('u1');
    expect(result).toEqual([]);
  });

  it('filters by repositoryIdsParam when provided', async () => {
    mockResolveRepos(['r1', 'r2', 'r3']);
    mockEventFindMany.mockResolvedValue([]);
    mockAnalysisCounts(0, 0, 0);

    await service.getReports('u1', 'r1,r3');
    const eventCall = mockEventFindMany.mock.calls[0][0];
    expect(eventCall.where.repositoryId.in).toEqual(['r1', 'r3']);
  });

  // ── buildWeeklySummary (via getReports output) ─────────────────────────────
  it('weekly summary contains activity totals', async () => {
    mockResolveRepos(['r1']);
    mockEventFindMany.mockResolvedValue([
      { type: 'PUSH', id: 'e1' },
      { type: 'PR_OPENED', id: 'e2' },
    ]);
    mockAnalysisCounts(0, 0, 0);

    const result = await service.getReports('u1');
    expect(result[0].summary).toMatch(/total activities/);
  });

  it('security summary is stable when no risks', async () => {
    mockResolveRepos(['r1']);
    mockEventFindMany.mockResolvedValue([]);
    mockAnalysisCounts(0, 0, 0);

    const result = await service.getReports('u1');
    expect(result[1].summary).toContain('No critical');
  });

  it('security summary lists counts when risks exist', async () => {
    mockResolveRepos(['r1']);
    mockEventFindMany.mockResolvedValue([]);
    mockAnalysisCounts(2, 3, 5);

    const result = await service.getReports('u1');
    expect(result[1].summary).toContain('2 critical');
    expect(result[1].summary).toContain('3 high-risk');
  });

  it('team summary shows no activity when no PRs', async () => {
    mockResolveRepos(['r1']);
    mockEventFindMany.mockResolvedValue([{ type: 'PUSH', id: 'e1' }]);
    mockAnalysisCounts(0, 0, 0);

    const result = await service.getReports('u1');
    expect(result[2].summary).toContain('No significant team activity');
  });

  // ── getReportById ──────────────────────────────────────────────────────────
  it('delegates to prisma.report.findUnique', async () => {
    const report = { id: 'rpt-1', title: 'test' };
    mockReportFindUnique.mockResolvedValue(report);
    const result = await service.getReportById('rpt-1');
    expect(result).toBe(report);
    expect(mockReportFindUnique).toHaveBeenCalledWith({ where: { id: 'rpt-1' } });
  });

  // ── generateReport ─────────────────────────────────────────────────────────
  it('throws when no accessible repositories', async () => {
    mockResolveRepos([]);
    await expect(service.generateReport('u1', { type: 'WEEKLY' as any, format: 'MARKDOWN' as any })).rejects.toThrow(ForbiddenException);
  });

  it('generates markdown report and saves to DB', async () => {
    mockResolveRepos(['r1']);
    mockEventFindMany.mockResolvedValue([{ type: 'PUSH', id: 'e1' }]);
    mockAnalysisCounts(0, 0, 0);
    const savedReport = { id: 'rpt-new', title: 'Report_WEEKLY_2024-01-01' };
    mockReportCreate.mockResolvedValue(savedReport);

    const result = await service.generateReport('u1', {
      type: 'WEEKLY' as any,
      format: 'MARKDOWN' as any,
    });
    expect(result).toBe(savedReport);
    expect(mockReportCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ format: 'MARKDOWN', generatedBy: 'u1' }),
      }),
    );
  });

  it('generates PDF report when format is PDF', async () => {
    mockResolveRepos(['r1']);
    mockEventFindMany.mockResolvedValue([]);
    mockAnalysisCounts(0, 0, 0);
    mockReportCreate.mockResolvedValue({ id: 'rpt-pdf' });

    const result = await service.generateReport('u1', {
      type: 'SECURITY' as any,
      format: 'PDF' as any,
    });
    expect(result.id).toBe('rpt-pdf');
    const savedContent = mockReportCreate.mock.calls[0][0].data.content;
    expect(savedContent).toContain('data:application/pdf');
  });
});
