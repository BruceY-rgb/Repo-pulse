/**
 * 单元测试 — FilterService 补充分支覆盖
 * 覆盖 regex 算子、in 算子、多条件组合、applyRules 优先级、hasRuleReferencingField
 */

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

const baseEvent = {
  type: 'PUSH',
  repository: 'org/repo',
  author: 'alice',
  riskLevel: 'HIGH',
  body: 'fix: critical security patch',
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

describe('FilterService — 补充分支覆盖', () => {
  let service: FilterService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FilterService();
  });

  // ── testRule — regex 算子 ──────────────────────────────────────────────────
  // getEventField 中 body 内容对应的字段名为 'customRegex'，不是 'body'
  describe('testRule – regex 算子', () => {
    it('正则匹配时返回 matched=true', () => {
      const result = service.testRule({
        conditions: [{ field: 'customRegex', operator: 'regex', value: 'security' }],
        event: baseEvent,
      });
      expect(result.matched).toBe(true);
      expect(result.action).toBe(FilterAction.INCLUDE);
    });

    it('正则不匹配时返回 matched=false', () => {
      const result = service.testRule({
        conditions: [{ field: 'customRegex', operator: 'regex', value: '^feat:' }],
        event: baseEvent,
      });
      expect(result.matched).toBe(false);
      expect(result.action).toBeNull();
    });

    it('无效正则不抛错，返回 matched=false', () => {
      const result = service.testRule({
        conditions: [{ field: 'customRegex', operator: 'regex', value: '[invalid' }],
        event: baseEvent,
      });
      expect(result.matched).toBe(false);
    });

    it('正则匹配大小写不敏感（flag i）', () => {
      const result = service.testRule({
        conditions: [{ field: 'customRegex', operator: 'regex', value: 'SECURITY' }],
        event: baseEvent,
      });
      expect(result.matched).toBe(true);
    });
  });

  // ── testRule — in 算子 ────────────────────────────────────────────────────
  describe('testRule – in 算子', () => {
    it('字段值在列表中时返回 matched=true', () => {
      const result = service.testRule({
        conditions: [{ field: 'riskLevel', operator: 'in', value: ['HIGH', 'CRITICAL'] }],
        event: baseEvent,
      });
      expect(result.matched).toBe(true);
    });

    it('字段值不在列表中时返回 matched=false', () => {
      const result = service.testRule({
        conditions: [{ field: 'riskLevel', operator: 'in', value: ['LOW', 'MEDIUM'] }],
        event: baseEvent,
      });
      expect(result.matched).toBe(false);
    });
  });

  // ── testRule — 未知算子 ────────────────────────────────────────────────────
  describe('testRule – 未知算子', () => {
    it('未知 operator 返回 matched=false（安全降级）', () => {
      const result = service.testRule({
        conditions: [{ field: 'author', operator: 'startsWith' as any, value: 'al' }],
        event: baseEvent,
      });
      expect(result.matched).toBe(false);
    });
  });

  // ── testRule — 字段不存在 ──────────────────────────────────────────────────
  describe('testRule – 事件字段不存在', () => {
    it('字段不存在于事件时返回 matched=false', () => {
      const result = service.testRule({
        conditions: [{ field: 'nonExistentField' as any, operator: 'eq', value: 'anything' }],
        event: baseEvent,
      });
      expect(result.matched).toBe(false);
    });
  });

  // ── testRule — 多条件 AND 逻辑 ────────────────────────────────────────────
  describe('testRule – 多条件 AND 逻辑', () => {
    it('所有条件都满足时返回 matched=true', () => {
      const result = service.testRule({
        conditions: [
          { field: 'author', operator: 'eq', value: 'alice' },
          { field: 'riskLevel', operator: 'in', value: ['HIGH', 'CRITICAL'] },
          { field: 'customRegex', operator: 'contains', value: 'security' },
        ],
        event: baseEvent,
      });
      expect(result.matched).toBe(true);
    });

    it('任一条件不满足时返回 matched=false（短路）', () => {
      const result = service.testRule({
        conditions: [
          { field: 'author', operator: 'eq', value: 'alice' },
          { field: 'riskLevel', operator: 'eq', value: 'LOW' }, // 不满足
          { field: 'customRegex', operator: 'contains', value: 'security' },
        ],
        event: baseEvent,
      });
      expect(result.matched).toBe(false);
    });

    it('空条件列表时默认 matched=true（无限制）', () => {
      const result = service.testRule({ conditions: [], event: baseEvent });
      expect(result.matched).toBe(true);
      expect(result.action).toBe(FilterAction.INCLUDE);
    });
  });

  // ── applyRules — 规则优先级 ───────────────────────────────────────────────
  describe('applyRules – 规则优先级', () => {
    it('优先级高的规则先匹配，匹配到后不继续', async () => {
      mockFindMany.mockResolvedValue([
        makeRule({ id: 'r1', priority: 10, action: FilterAction.EXCLUDE, conditions: [{ field: 'author', operator: 'eq', value: 'alice' }] }),
        makeRule({ id: 'r2', priority: 5, action: FilterAction.INCLUDE, conditions: [{ field: 'author', operator: 'eq', value: 'alice' }] }),
      ]);

      const result = await service.applyRules('u1', baseEvent);
      // priority=10 的规则先命中
      expect(result.action).toBe(FilterAction.EXCLUDE);
      // 验证 applyRules 向 DB 请求按 priority 降序排列，而非依赖 mock 数组顺序
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { priority: 'desc' } }),
      );
    });

    it('无规则命中时返回默认 INCLUDE', async () => {
      mockFindMany.mockResolvedValue([
        makeRule({ conditions: [{ field: 'author', operator: 'eq', value: 'nobody' }] }),
      ]);

      const result = await service.applyRules('u1', baseEvent);
      expect(result.action).toBe(FilterAction.INCLUDE);
    });

    it('无活跃规则时返回默认 INCLUDE', async () => {
      mockFindMany.mockResolvedValue([]);
      const result = await service.applyRules('u1', baseEvent);
      expect(result.action).toBe(FilterAction.INCLUDE);
    });

    it('TAG 动作规则命中时返回 TAG', async () => {
      mockFindMany.mockResolvedValue([
        makeRule({ action: FilterAction.TAG, conditions: [{ field: 'riskLevel', operator: 'eq', value: 'HIGH' }] }),
      ]);

      const result = await service.applyRules('u1', baseEvent);
      expect(result.action).toBe(FilterAction.TAG);
    });
  });

  // ── hasRuleReferencingField ───────────────────────────────────────────────
  describe('hasRuleReferencingField()', () => {
    it('有活跃规则引用该字段时返回 true', async () => {
      mockFindMany.mockResolvedValue([
        { conditions: [{ field: 'riskLevel', operator: 'eq', value: 'HIGH' }] },
      ]);

      const result = await service.hasRuleReferencingField('u1', 'riskLevel');
      expect(result).toBe(true);
    });

    it('无活跃规则引用该字段时返回 false', async () => {
      mockFindMany.mockResolvedValue([
        { conditions: [{ field: 'author', operator: 'eq', value: 'alice' }] },
      ]);

      const result = await service.hasRuleReferencingField('u1', 'riskLevel');
      expect(result).toBe(false);
    });

    it('无规则时返回 false', async () => {
      mockFindMany.mockResolvedValue([]);
      const result = await service.hasRuleReferencingField('u1', 'riskLevel');
      expect(result).toBe(false);
    });

    it('条件数组为空的规则不计入引用', async () => {
      mockFindMany.mockResolvedValue([{ conditions: [] }]);
      const result = await service.hasRuleReferencingField('u1', 'riskLevel');
      expect(result).toBe(false);
    });
  });

  // ── CRUD 方法 ─────────────────────────────────────────────────────────────
  describe('getRules()', () => {
    it('返回用户规则列表', async () => {
      const rules = [makeRule({ id: 'r1' }), makeRule({ id: 'r2' })];
      mockFindMany.mockResolvedValue(rules);

      const result = await service.getRules('u1');
      expect(result).toEqual(rules);
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u1' } }),
      );
    });
  });

  describe('createRule()', () => {
    it('创建规则并返回新记录', async () => {
      const newRule = makeRule({ id: 'new-1' });
      mockCreate.mockResolvedValue(newRule);

      const result = await service.createRule('u1', {
        name: '新规则',
        conditions: [],
        action: FilterAction.EXCLUDE,
      });
      expect(result).toEqual(newRule);
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe('deleteRule()', () => {
    it('规则不属于用户时抛错', async () => {
      mockFindFirst.mockResolvedValue(null);
      await expect(service.deleteRule('u1', 'other-rule')).rejects.toThrow();
    });

    it('规则存在时正常删除', async () => {
      const rule = makeRule({ id: 'r1', userId: 'u1' });
      mockFindFirst.mockResolvedValue(rule);
      mockDelete.mockResolvedValue(rule);

      await expect(service.deleteRule('u1', 'r1')).resolves.not.toThrow();
      expect(mockDelete).toHaveBeenCalledTimes(1);
    });
  });
});
