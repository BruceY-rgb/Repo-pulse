import { ApprovalService } from '../../src/modules/approval/approval.service';
import { ApprovalStatus, RiskLevel } from '@repo-pulse/database';

const mockEventFindUnique = jest.fn();
const mockApprovalCreate = jest.fn();
const mockApprovalFindUnique = jest.fn();
const mockApprovalUpdate = jest.fn();
const mockApprovalFindMany = jest.fn();
const mockApprovalCount = jest.fn();
const mockUserRepoFindMany = jest.fn();
const mockEventFindMany = jest.fn();

jest.mock('@repo-pulse/database', () => ({
  ApprovalStatus: { PENDING: 'PENDING', APPROVED: 'APPROVED', REJECTED: 'REJECTED', EDITED: 'EDITED' },
  RiskLevel: { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', CRITICAL: 'CRITICAL' },
  RepositoryAccessLevel: { OWNER: 'OWNER', ADMIN: 'ADMIN', MAINTAIN: 'MAINTAIN', WRITE: 'WRITE', TRIAGE: 'TRIAGE', READ: 'READ', NONE: 'NONE' },
  RepositoryAccessMode: { EDITABLE: 'EDITABLE', MONITOR: 'MONITOR' },
  prisma: {
    event: {
      findUnique: (...a: any[]) => mockEventFindUnique(...a),
      findMany: (...a: any[]) => mockEventFindMany(...a),
    },
    approval: {
      create: (...a: any[]) => mockApprovalCreate(...a),
      findUnique: (...a: any[]) => mockApprovalFindUnique(...a),
      findMany: (...a: any[]) => mockApprovalFindMany(...a),
      update: (...a: any[]) => mockApprovalUpdate(...a),
      count: (...a: any[]) => mockApprovalCount(...a),
    },
    userRepository: {
      findMany: (...a: any[]) => mockUserRepoFindMany(...a),
    },
  },
}));

function makeApproval(overrides: object = {}) {
  return {
    id: 'appr-1',
    eventId: 'evt-1',
    event: { id: 'evt-1', repositoryId: 'r1' },
    reviewerId: null,
    status: ApprovalStatus.PENDING,
    originalContent: 'summary text',
    editedContent: null,
    comment: null,
    createdAt: new Date(),
    reviewedAt: null,
    ...overrides,
  };
}

function makeEvent(riskLevel: string, overrides: object = {}) {
  return {
    id: 'evt-1',
    analyses: [
      { riskLevel, summary: `${riskLevel} risk summary`, status: 'COMPLETED', createdAt: new Date() },
    ],
    repository: { users: [{ userId: 'u1' }] },
    ...overrides,
  };
}

describe('ApprovalService', () => {
  let service: ApprovalService;
  let gatewayMock: { broadcastApprovalUpdated: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUserRepoFindMany.mockResolvedValue([{ repositoryId: 'r1' }]);
    gatewayMock = { broadcastApprovalUpdated: jest.fn() };
    service = new ApprovalService(
      gatewayMock as unknown as ConstructorParameters<typeof ApprovalService>[0],
    );
  });

  // ── createFromAIAnalysis ───────────────────────────────────────────────────
  describe('createFromAIAnalysis', () => {
    it('throws when event not found', async () => {
      mockEventFindUnique.mockResolvedValue(null);
      await expect(service.createFromAIAnalysis('bad-id')).rejects.toThrow('Event not found: bad-id');
    });

    it.each([RiskLevel.HIGH, RiskLevel.CRITICAL])(
      'creates PENDING approval for %s risk',
      async (riskLevel) => {
        mockEventFindUnique.mockResolvedValue(makeEvent(riskLevel));
        mockApprovalCreate.mockResolvedValue(makeApproval({ originalContent: `${riskLevel} risk summary` }));
        const result = await service.createFromAIAnalysis('evt-1');
        expect(result.status).toBe(ApprovalStatus.PENDING);
        expect(mockApprovalCreate).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ eventId: 'evt-1', status: ApprovalStatus.PENDING }) }),
        );
      },
    );

    it.each([RiskLevel.LOW, RiskLevel.MEDIUM])(
      'returns null for %s risk (no approval needed)',
      async (riskLevel) => {
        mockEventFindUnique.mockResolvedValue(makeEvent(riskLevel));
        const result = await service.createFromAIAnalysis('evt-1');
        expect(result).toBeFalsy();
        expect(mockApprovalCreate).not.toHaveBeenCalled();
      },
    );

    it('returns null when event has no analyses', async () => {
      mockEventFindUnique.mockResolvedValue({ id: 'evt-1', analyses: [], repository: { users: [{ userId: 'u1' }] } });
      const result = await service.createFromAIAnalysis('evt-1');
      expect(result).toBeFalsy();
    });
  });

  // ── approve ────────────────────────────────────────────────────────────────
  describe('approve', () => {
    it('throws when approval not found', async () => {
      mockApprovalFindUnique.mockResolvedValue(null);
      await expect(service.approve('bad-id', 'u1')).rejects.toThrow('Approval not found: bad-id');
    });

    it('throws when approval is not PENDING', async () => {
      mockApprovalFindUnique.mockResolvedValue(makeApproval({ status: ApprovalStatus.APPROVED }));
      await expect(service.approve('appr-1', 'u1')).rejects.toThrow('Approval is not pending: appr-1');
    });

    it('updates status to APPROVED', async () => {
      mockApprovalFindUnique.mockResolvedValue(makeApproval());
      mockApprovalUpdate.mockResolvedValue(makeApproval({ status: ApprovalStatus.APPROVED }));
      const result = await service.approve('appr-1', 'u1', 'lgtm');
      expect(result.status).toBe(ApprovalStatus.APPROVED);
      expect(mockApprovalUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: ApprovalStatus.APPROVED, reviewerId: 'u1' }) }),
      );
      expect(gatewayMock.broadcastApprovalUpdated).toHaveBeenCalledWith(
        expect.objectContaining({
          approvalId: 'appr-1',
          repositoryId: 'r1',
          eventId: 'evt-1',
          status: ApprovalStatus.APPROVED,
        }),
      );
    });

    it('still resolves when the realtime broadcast throws', async () => {
      mockApprovalFindUnique.mockResolvedValue(makeApproval());
      mockApprovalUpdate.mockResolvedValue(makeApproval({ status: ApprovalStatus.APPROVED }));
      gatewayMock.broadcastApprovalUpdated.mockImplementation(() => {
        throw new Error('socket down');
      });
      const result = await service.approve('appr-1', 'u1');
      expect(result.status).toBe(ApprovalStatus.APPROVED);
    });
  });

  // ── reject ─────────────────────────────────────────────────────────────────
  describe('reject', () => {
    it('throws when approval not found', async () => {
      mockApprovalFindUnique.mockResolvedValue(null);
      await expect(service.reject('bad-id', 'u1')).rejects.toThrow('Approval not found');
    });

    it('throws when approval is not PENDING', async () => {
      mockApprovalFindUnique.mockResolvedValue(makeApproval({ status: ApprovalStatus.REJECTED }));
      await expect(service.reject('appr-1', 'u1')).rejects.toThrow('Approval is not pending');
    });

    it('updates status to REJECTED', async () => {
      mockApprovalFindUnique.mockResolvedValue(makeApproval());
      mockApprovalUpdate.mockResolvedValue(makeApproval({ status: ApprovalStatus.REJECTED }));
      const result = await service.reject('appr-1', 'u1', 'needs work');
      expect(result.status).toBe(ApprovalStatus.REJECTED);
      expect(gatewayMock.broadcastApprovalUpdated).toHaveBeenCalledWith(
        expect.objectContaining({
          approvalId: 'appr-1',
          repositoryId: 'r1',
          eventId: 'evt-1',
          status: ApprovalStatus.REJECTED,
        }),
      );
    });
  });

  // ── editAndApprove ─────────────────────────────────────────────────────────
  describe('editAndApprove', () => {
    it('throws when approval not found', async () => {
      mockApprovalFindUnique.mockResolvedValue(null);
      await expect(service.editAndApprove('bad-id', 'u1', 'edited')).rejects.toThrow('Approval not found');
    });

    it('throws when not PENDING', async () => {
      mockApprovalFindUnique.mockResolvedValue(makeApproval({ status: ApprovalStatus.APPROVED }));
      await expect(service.editAndApprove('appr-1', 'u1', 'edited')).rejects.toThrow('Approval is not pending');
    });

    it('updates to EDITED with edited content', async () => {
      mockApprovalFindUnique.mockResolvedValue(makeApproval());
      mockApprovalUpdate.mockResolvedValue(makeApproval({ status: ApprovalStatus.EDITED, editedContent: 'fixed' }));
      const result = await service.editAndApprove('appr-1', 'u1', 'fixed');
      expect(result.status).toBe(ApprovalStatus.EDITED);
      expect(mockApprovalUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: ApprovalStatus.EDITED, editedContent: 'fixed' }) }),
      );
      expect(gatewayMock.broadcastApprovalUpdated).toHaveBeenCalledWith(
        expect.objectContaining({
          approvalId: 'appr-1',
          repositoryId: 'r1',
          eventId: 'evt-1',
          status: ApprovalStatus.EDITED,
        }),
      );
    });
  });

  // ── getPendingCount ────────────────────────────────────────────────────────
  describe('getPendingCount', () => {
    it('returns 0 when user has no repositories', async () => {
      mockUserRepoFindMany.mockResolvedValue([]);
      const count = await service.getPendingCount('u1');
      expect(count).toBe(0);
    });

    it('returns 0 when repositories have no events', async () => {
      mockUserRepoFindMany.mockResolvedValue([{ repositoryId: 'r1' }]);
      mockEventFindMany.mockResolvedValue([]);
      mockApprovalCount.mockResolvedValue(0);
      const count = await service.getPendingCount('u1');
      expect(count).toBe(0);
    });

    it('returns count from prisma.approval.count', async () => {
      mockUserRepoFindMany.mockResolvedValue([{ repositoryId: 'r1' }]);
      mockEventFindMany.mockResolvedValue([{ id: 'evt-1' }]);
      mockApprovalCount.mockResolvedValue(3);
      const count = await service.getPendingCount('u1');
      expect(count).toBe(3);
    });
  });
});
