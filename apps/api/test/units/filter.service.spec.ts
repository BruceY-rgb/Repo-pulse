import { FilterService } from '../../src/modules/filter/filter.service';
import { FilterAction } from '@repo-pulse/database';

// ── prisma mock ──────────────────────────────────────────────────────────────
const mockFindMany = jest.fn();
const mockFindFirst = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();

jest.mock('@repo-pulse/database', () => ({
  FilterAction: { INCLUDE: 'INCLUDE', EXCLUDE: 'EXCLUDE', TAG: 'TAG' },
  prisma: {
    filterRule: {
      findMany: (...a: any[]) => mockFindMany(...a),
      findFirst: (...a: any[]) => mockFindFirst(...a),
      create: (...a: any[]) => mockCreate(...a),
      update: (...a: any[]) => mockUpdate(...a),
      delete: (...a: any[]) => mockDelete(...a),
    },
  },
}));

// ── helpers ──────────────────────────────────────────────────────────────────
const baseEvent = {
  type: 'PUSH',
  repository: 'org/repo',
  author: 'alice',
  riskLevel: 'LOW',
  body: 'fix: typo in readme',
};

function makeRule(overrides: object = {}) {
  return {
    id: 'rule-1',
    userId: 'u1',
    name: 'r',
    description: null,
    conditions: [],
    action: FilterAction.EXCLUDE,
    isActive: true,
    priority: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ── tests ────────────────────────────────────────────────────────────────────
describe('FilterService', () => {
  let service: FilterService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FilterService();
  });

  describe('testRule – payload validation and action preview', () => {
    it('returns the provided action when the rule matches', () => {
      const result = service.testRule({
        conditions: [{ field: 'author', operator: 'eq', value: 'alice' }],
        action: FilterAction.EXCLUDE,
        event: baseEvent,
      });

      expect(result).toEqual({ matched: true, action: FilterAction.EXCLUDE });
    });

    it('throws BadRequestException for an empty payload instead of TypeError', () => {
      expect(() => service.testRule({} as any)).toThrow('conditions must be an array');
    });

    it('throws BadRequestException when operator=in uses a non-array value', () => {
      expect(() =>
        service.testRule({
          conditions: [{ field: 'author', operator: 'in', value: 'alice' as any }],
          event: baseEvent,
        }),
      ).toThrow('conditions[0].value must be a string array for operator "in"');
    });
  });

  // ── testRule — eq ──────────────────────────────────────────────────────────
  describe('testRule – eq operator', () => {
    it('matches when field equals value', () => {
      const result = service.testRule({
        conditions: [{ field: 'author', operator: 'eq', value: 'alice' }],
        event: baseEvent,
      });
      expect(result.matched).toBe(true);
      expect(result.action).toBe(FilterAction.INCLUDE);
    });

    it('does not match when field differs', () => {
      const result = service.testRule({
        conditions: [{ field: 'author', operator: 'eq', value: 'bob' }],
        event: baseEvent,
      });
      expect(result.matched).toBe(false);
      expect(result.action).toBeNull();
    });
  });

  // ── testRule — contains ────────────────────────────────────────────────────
  describe('testRule – contains operator', () => {
    it('matches when field contains substring', () => {
      const result = service.testRule({
        conditions: [{ field: 'customRegex', operator: 'contains', value: 'typo' }],
        event: baseEvent,
      });
      expect(result.matched).toBe(true);
    });

    it('does not match when substring absent', () => {
      const result = service.testRule({
        conditions: [{ field: 'customRegex', operator: 'contains', value: 'breaking' }],
        event: baseEvent,
      });
      expect(result.matched).toBe(false);
    });
  });

  // ── testRule — regex ───────────────────────────────────────────────────────
  describe('testRule – regex operator', () => {
    it('matches with case-insensitive regex', () => {
      const result = service.testRule({
        conditions: [{ field: 'customRegex', operator: 'regex', value: '^fix:' }],
        event: baseEvent,
      });
      expect(result.matched).toBe(true);
    });

    it('does not match when regex fails', () => {
      const result = service.testRule({
        conditions: [{ field: 'customRegex', operator: 'regex', value: '^feat:' }],
        event: baseEvent,
      });
      expect(result.matched).toBe(false);
    });

    it('throws BadRequestException for invalid regex', () => {
      expect(() =>
        service.testRule({
          conditions: [{ field: 'author', operator: 'regex', value: '[invalid(' }],
          event: baseEvent,
        }),
      ).toThrow('conditions[0].value must be a valid regex');
    });
  });

  // ── testRule — in ──────────────────────────────────────────────────────────
  describe('testRule – in operator', () => {
    it('matches when field value is in the list', () => {
      const result = service.testRule({
        conditions: [{ field: 'eventType', operator: 'in', value: ['PUSH', 'PR_OPENED'] }],
        event: baseEvent,
      });
      expect(result.matched).toBe(true);
    });

    it('does not match when field value is not in the list', () => {
      const result = service.testRule({
        conditions: [{ field: 'eventType', operator: 'in', value: ['RELEASE'] }],
        event: baseEvent,
      });
      expect(result.matched).toBe(false);
    });
  });

  // ── testRule — field mapping ───────────────────────────────────────────────
  describe('testRule – field mapping', () => {
    it('maps eventType field to event.type', () => {
      const r = service.testRule({
        conditions: [{ field: 'eventType', operator: 'eq', value: 'PUSH' }],
        event: baseEvent,
      });
      expect(r.matched).toBe(true);
    });

    it('maps repository field', () => {
      const r = service.testRule({
        conditions: [{ field: 'repository', operator: 'eq', value: 'org/repo' }],
        event: baseEvent,
      });
      expect(r.matched).toBe(true);
    });

    it('maps riskLevel field', () => {
      const r = service.testRule({
        conditions: [{ field: 'riskLevel', operator: 'eq', value: 'LOW' }],
        event: baseEvent,
      });
      expect(r.matched).toBe(true);
    });

    it('throws BadRequestException for unknown field', () => {
      expect(() =>
        service.testRule({
          conditions: [{ field: 'unknown' as any, operator: 'eq', value: 'x' }],
          event: baseEvent,
        }),
      ).toThrow('conditions[0].field must be one of');
    });
  });

  // ── testRule — multi-condition AND logic ───────────────────────────────────
  describe('testRule – multiple conditions (AND)', () => {
    it('matches only when all conditions pass', () => {
      const r = service.testRule({
        conditions: [
          { field: 'author', operator: 'eq', value: 'alice' },
          { field: 'eventType', operator: 'eq', value: 'PUSH' },
        ],
        event: baseEvent,
      });
      expect(r.matched).toBe(true);
    });

    it('fails as soon as one condition does not match', () => {
      const r = service.testRule({
        conditions: [
          { field: 'author', operator: 'eq', value: 'alice' },
          { field: 'eventType', operator: 'eq', value: 'RELEASE' },
        ],
        event: baseEvent,
      });
      expect(r.matched).toBe(false);
    });

    it('empty conditions list always matches', () => {
      const r = service.testRule({ conditions: [], event: baseEvent });
      expect(r.matched).toBe(true);
    });
  });

  // ── applyRules ─────────────────────────────────────────────────────────────
  describe('applyRules', () => {
    it('returns INCLUDE when no active rules exist', async () => {
      mockFindMany.mockResolvedValue([]);
      const result = await service.applyRules('u1', baseEvent);
      expect(result.action).toBe(FilterAction.INCLUDE);
      expect(result.matchedRule).toBeUndefined();
    });

    it('returns EXCLUDE when a matching EXCLUDE rule is found', async () => {
      const rule = makeRule({
        action: FilterAction.EXCLUDE,
        conditions: [{ field: 'author', operator: 'eq', value: 'alice' }],
      });
      mockFindMany.mockResolvedValue([rule]);
      const result = await service.applyRules('u1', baseEvent);
      expect(result.action).toBe(FilterAction.EXCLUDE);
      expect(result.matchedRule).toBe(rule);
    });

    it('skips non-matching rules and returns INCLUDE', async () => {
      const rule = makeRule({
        conditions: [{ field: 'author', operator: 'eq', value: 'bob' }],
      });
      mockFindMany.mockResolvedValue([rule]);
      const result = await service.applyRules('u1', baseEvent);
      expect(result.action).toBe(FilterAction.INCLUDE);
    });

    it('skips malformed stored rules and continues matching later rules', async () => {
      const malformedRule = makeRule({
        id: 'bad',
        conditions: [{ field: 'author', operator: 'regex', value: '[invalid(' }],
      });
      const validRule = makeRule({
        id: 'valid',
        action: FilterAction.EXCLUDE,
        conditions: [{ field: 'author', operator: 'eq', value: 'alice' }],
      });
      mockFindMany.mockResolvedValue([malformedRule, validRule]);

      const result = await service.applyRules('u1', baseEvent);

      expect(result.action).toBe(FilterAction.EXCLUDE);
      expect(result.matchedRule?.id).toBe('valid');
    });

    it('applies highest-priority rule first (first in sorted list wins)', async () => {
      const lowPri = makeRule({ id: 'low', priority: 0, action: FilterAction.INCLUDE,
        conditions: [{ field: 'author', operator: 'eq', value: 'alice' }] });
      const highPri = makeRule({ id: 'high', priority: 100, action: FilterAction.EXCLUDE,
        conditions: [{ field: 'author', operator: 'eq', value: 'alice' }] });
      // prisma returns already ordered by priority desc
      mockFindMany.mockResolvedValue([highPri, lowPri]);
      const result = await service.applyRules('u1', baseEvent);
      expect(result.action).toBe(FilterAction.EXCLUDE);
      expect(result.matchedRule?.id).toBe('high');
    });
  });

  // ── hasRuleReferencingField ────────────────────────────────────────────────
  describe('hasRuleReferencingField', () => {
    it('returns true when an active rule references the field', async () => {
      mockFindMany.mockResolvedValue([
        { conditions: [{ field: 'riskLevel', operator: 'eq', value: 'HIGH' }] },
      ]);
      const result = await service.hasRuleReferencingField('u1', 'riskLevel');
      expect(result).toBe(true);
    });

    it('returns false when no rule references the field', async () => {
      mockFindMany.mockResolvedValue([
        { conditions: [{ field: 'author', operator: 'eq', value: 'bot' }] },
      ]);
      const result = await service.hasRuleReferencingField('u1', 'riskLevel');
      expect(result).toBe(false);
    });

    it('returns false when there are no active rules', async () => {
      mockFindMany.mockResolvedValue([]);
      const result = await service.hasRuleReferencingField('u1', 'riskLevel');
      expect(result).toBe(false);
    });
  });

  // ── updateRule / deleteRule error paths ────────────────────────────────────
  describe('updateRule', () => {
    it('throws when rule does not belong to user', async () => {
      mockFindFirst.mockResolvedValue(null);
      await expect(service.updateRule('u1', 'bad-id', { name: 'x' })).rejects.toThrow(
        'Filter rule not found: bad-id',
      );
    });
  });

  describe('deleteRule', () => {
    it('throws when rule does not belong to user', async () => {
      mockFindFirst.mockResolvedValue(null);
      await expect(service.deleteRule('u1', 'bad-id')).rejects.toThrow(
        'Filter rule not found: bad-id',
      );
    });

    it('deletes the rule when found', async () => {
      mockFindFirst.mockResolvedValue(makeRule());
      mockDelete.mockResolvedValue(undefined);
      await expect(service.deleteRule('u1', 'rule-1')).resolves.toBeUndefined();
      expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'rule-1' } });
    });
  });
});
