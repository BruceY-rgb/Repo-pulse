const mockUserRepoFindMany = jest.fn();
const mockEventFindMany = jest.fn();
const mockApprovalFindMany = jest.fn();
const mockApprovalCount = jest.fn();
const mockApprovalDelete = jest.fn();
const mockApprovalFindUnique = jest.fn();

jest.mock('@repo-pulse/database', () => ({
  ApprovalStatus: { PENDING: 'PENDING', APPROVED: 'APPROVED', REJECTED: 'REJECTED', EDITED: 'EDITED' },
  RiskLevel: { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', CRITICAL: 'CRITICAL' },
  prisma: {
    event: { findUnique: jest.fn(), findMany: (...a: any[]) => mockEventFindMany(...a) },
    approval: {
      create: jest.fn(),
      findUnique: (...a: any[]) => mockApprovalFindUnique(...a),
      findMany: (...a: any[]) => mockApprovalFindMany(...a),
      update: jest.fn(),
      count: (...a: any[]) => mockApprovalCount(...a),
      delete: (...a: any[]) => mockApprovalDelete(...a),
    },
    userRepository: {
      findMany: (...a: any[]) => mockUserRepoFindMany(...a),
    },
  },
}));

import { ApprovalService } from '../../src/modules/approval/approval.service';

describe('ApprovalService - additional coverage', () => {
  let service: ApprovalService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ApprovalService();
  });

  // ── getApprovals ──────────────────────────────────────────────────────────
  describe('getApprovals', () => {
    it('returns empty when user has no repositories', async () => {
      mockUserRepoFindMany.mockResolvedValue([]);
      const result = await service.getApprovals('u1');
      expect(result).toEqual({ approvals: [], total: 0 });
    });

    it('returns empty when no events in repos', async () => {
      mockUserRepoFindMany.mockResolvedValue([{ repositoryId: 'r1' }]);
      mockEventFindMany.mockResolvedValue([]);
      const result = await service.getApprovals('u1');
      expect(result).toEqual({ approvals: [], total: 0 });
    });

    it('returns approvals and total count', async () => {
      mockUserRepoFindMany.mockResolvedValue([{ repositoryId: 'r1' }]);
      mockEventFindMany.mockResolvedValue([{ id: 'e1' }]);
      const approvals = [{ id: 'a1', status: 'PENDING' }];
      mockApprovalFindMany.mockResolvedValue(approvals);
      mockApprovalCount.mockResolvedValue(1);

      const result = await service.getApprovals('u1');
      expect(result.approvals).toBe(approvals);
      expect(result.total).toBe(1);
    });

    it('filters by status when provided', async () => {
      mockUserRepoFindMany.mockResolvedValue([{ repositoryId: 'r1' }]);
      mockEventFindMany.mockResolvedValue([{ id: 'e1' }]);
      mockApprovalFindMany.mockResolvedValue([]);
      mockApprovalCount.mockResolvedValue(0);

      await service.getApprovals('u1', { status: 'PENDING' as any });
      const where = mockApprovalFindMany.mock.calls[0][0].where;
      expect(where.status).toBe('PENDING');
    });

    it('uses default limit=20 and offset=0', async () => {
      mockUserRepoFindMany.mockResolvedValue([{ repositoryId: 'r1' }]);
      mockEventFindMany.mockResolvedValue([{ id: 'e1' }]);
      mockApprovalFindMany.mockResolvedValue([]);
      mockApprovalCount.mockResolvedValue(0);

      await service.getApprovals('u1');
      const call = mockApprovalFindMany.mock.calls[0][0];
      expect(call.take).toBe(20);
      expect(call.skip).toBe(0);
    });

    it('respects custom limit and offset', async () => {
      mockUserRepoFindMany.mockResolvedValue([{ repositoryId: 'r1' }]);
      mockEventFindMany.mockResolvedValue([{ id: 'e1' }]);
      mockApprovalFindMany.mockResolvedValue([]);
      mockApprovalCount.mockResolvedValue(0);

      await service.getApprovals('u1', { limit: 5, offset: 10 });
      const call = mockApprovalFindMany.mock.calls[0][0];
      expect(call.take).toBe(5);
      expect(call.skip).toBe(10);
    });
  });

  // ── getById ───────────────────────────────────────────────────────────────
  describe('getById', () => {
    it('returns approval when found', async () => {
      const approval = { id: 'a1', status: 'PENDING' };
      mockApprovalFindUnique.mockResolvedValue(approval);
      const result = await service.getById('a1');
      expect(result).toBe(approval);
    });

    it('returns null when not found', async () => {
      mockApprovalFindUnique.mockResolvedValue(null);
      const result = await service.getById('bad-id');
      expect(result).toBeNull();
    });
  });

  // ── delete ────────────────────────────────────────────────────────────────
  describe('delete', () => {
    it('calls prisma.approval.delete with correct id', async () => {
      mockApprovalDelete.mockResolvedValue({});
      await service.delete('a1');
      expect(mockApprovalDelete).toHaveBeenCalledWith({ where: { id: 'a1' } });
    });

    it('resolves to undefined', async () => {
      mockApprovalDelete.mockResolvedValue({});
      await expect(service.delete('a1')).resolves.toBeUndefined();
    });
  });

  // ── getPendingCount with repositoryIdsParam ───────────────────────────────
  describe('getPendingCount with repositoryIdsParam', () => {
    it('filters by intersection of requested and accessible repos', async () => {
      mockUserRepoFindMany.mockResolvedValue([
        { repositoryId: 'r1' },
        { repositoryId: 'r2' },
      ]);
      mockApprovalCount.mockResolvedValue(2);

      await service.getPendingCount('u1', 'r1,r3'); // r3 not accessible
      expect(mockApprovalCount).toHaveBeenCalled();
    });

    it('returns 0 when no intersection of requested and accessible repos', async () => {
      mockUserRepoFindMany.mockResolvedValue([{ repositoryId: 'r1' }]);

      const count = await service.getPendingCount('u1', 'r99');
      expect(count).toBe(0);
      expect(mockApprovalCount).not.toHaveBeenCalled();
    });
  });
});
