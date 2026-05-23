jest.mock('jspdf', () => ({ jsPDF: jest.fn() }), { virtual: true });
jest.mock('@repo-pulse/database', () => ({
  ReportType: { WEEKLY: 'WEEKLY', MONTHLY: 'MONTHLY' },
  ReportFormat: { PDF: 'PDF', MARKDOWN: 'MARKDOWN' },
  RepositoryAccessLevel: { OWNER: 'OWNER', ADMIN: 'ADMIN', MAINTAIN: 'MAINTAIN', WRITE: 'WRITE', TRIAGE: 'TRIAGE', READ: 'READ', NONE: 'NONE' },
  RepositoryAccessMode: { EDITABLE: 'EDITABLE', MONITOR: 'MONITOR' },
  prisma: {},
}));

import { NotFoundException } from '@nestjs/common';
import { ReportController } from '../../src/modules/report/report.controller';

const user = { sub: 'u1' };

function makeService(overrides: Record<string, jest.Mock> = {}) {
  return {
    getReports: jest.fn().mockResolvedValue([{ id: 'rpt1' }]),
    generateReport: jest.fn().mockResolvedValue({ id: 'rpt1', title: 'Weekly Report', format: 'PDF', content: 'data:application/pdf;filename=generated.pdf;base64,AAAA' }),
    getReportById: jest.fn().mockResolvedValue({ id: 'rpt1', title: 'Weekly Report', format: 'PDF', content: 'data:application/pdf;filename=generated.pdf;base64,AAAA' }),
    ...overrides,
  } as any;
}

function makeRes() {
  return { set: jest.fn(), end: jest.fn(), send: jest.fn() } as any;
}

describe('ReportController', () => {
  let controller: ReportController;
  let service: ReturnType<typeof makeService>;

  beforeEach(() => {
    service = makeService();
    controller = new ReportController(service);
  });

  it('getReports delegates to service', async () => {
    const result = await controller.getReports(user, 'r1,r2', '2024-01-01', '2024-12-31');
    expect(service.getReports).toHaveBeenCalledWith('u1', 'r1,r2', '2024-01-01', '2024-12-31');
    expect(Array.isArray(result)).toBe(true);
  });

  it('generate delegates to service with defaults', async () => {
    const body = { repositoryIds: ['r1'], type: undefined as any, format: undefined as any };
    const result = await controller.generate(user, body);
    expect(service.generateReport).toHaveBeenCalledWith('u1', expect.objectContaining({ type: 'WEEKLY', format: 'PDF' }));
    expect(result).toHaveProperty('id', 'rpt1');
  });

  it('generate passes provided type and format', async () => {
    const body = { type: 'MONTHLY' as any, format: 'MARKDOWN' as any };
    await controller.generate(user, body);
    expect(service.generateReport).toHaveBeenCalledWith('u1', expect.objectContaining({ type: 'MONTHLY', format: 'MARKDOWN' }));
  });

  it('download throws NotFoundException when report not found', async () => {
    service.getReportById.mockResolvedValue(null);
    await expect(controller.download('bad', makeRes())).rejects.toThrow(NotFoundException);
  });

  it('download sends PDF buffer for PDF format', async () => {
    const res = makeRes();
    await controller.download('rpt1', res);
    expect(res.set).toHaveBeenCalledWith(expect.objectContaining({ 'Content-Type': 'application/pdf' }));
    expect(res.end).toHaveBeenCalled();
  });

  it('download sends markdown content for non-PDF format', async () => {
    service.getReportById.mockResolvedValue({ id: 'rpt2', title: 'MD Report', format: 'MARKDOWN', content: '# Report' });
    const res = makeRes();
    await controller.download('rpt2', res);
    expect(res.set).toHaveBeenCalledWith(expect.objectContaining({ 'Content-Type': 'text/markdown' }));
    expect(res.send).toHaveBeenCalledWith('# Report');
  });
});
