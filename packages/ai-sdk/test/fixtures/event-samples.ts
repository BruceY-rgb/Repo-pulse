/**
 * Step 0 标准化事件样例
 *
 * 10 个用例覆盖文档/重构/认证/迁移/泄露等场景，用于验证 AI Provider 模型层可靠性。
 */
import type { AnalysisInput } from '../../src/interfaces/ai-provider';

export interface EventSample {
  name: string;
  input: AnalysisInput;
  /** 人工预期，用于验证 AI 输出语义是否合理 */
  expected: {
    category: string[];       // 可接受范围
    riskLevel: string[];      // 可接受范围
    suggestedAction: string[]; // 可接受范围
  };
}

export const eventSamples: EventSample[] = [
  {
    name: 'Case 1: 文档修改 - 更新 README 安装说明',
    input: {
      eventType: 'ISSUE_OPENED',
      title: 'Update README installation instructions',
      body: 'The current README references Node 16 but the project now requires Node 20+. We should update the installation section to reflect the new minimum version and add notes about pnpm setup.',
      language: 'en',
    },
    expected: {
      category: ['DOCS'],
      riskLevel: ['LOW'],
      suggestedAction: ['SAFE_TO_IGNORE'],
    },
  },
  {
    name: 'Case 2: 前端重构 - 通知过滤页面',
    input: {
      eventType: 'PR_OPENED',
      title: 'Refactor notification filter page with template rules',
      body: 'This PR refactors the notification filter page by:\n- Adding template-based rule creation\n- Adding recent event preview\n- Adding advanced rule editor collapse/expand\n- Moving filter state to Zustand store',
      language: 'en',
    },
    expected: {
      category: ['REFACTOR', 'FEATURE'],
      riskLevel: ['MEDIUM'],
      suggestedAction: ['TEST_REQUIRED'],
    },
  },
  {
    name: 'Case 3: 认证模块 - token 生成逻辑修改',
    input: {
      eventType: 'PUSH',
      title: 'Modify JWT token generation logic with session expiration',
      body: 'Changed the JWT token generation to include user roles in the payload and added session expiration tracking. Updated the auth middleware to check token validity against the new schema.',
      language: 'en',
    },
    expected: {
      category: ['SECURITY', 'REFACTOR'],
      riskLevel: ['HIGH'],
      suggestedAction: ['REVIEW_REQUIRED'],
    },
  },
  {
    name: 'Case 4: 数据库迁移 - 新增 permissions 表',
    input: {
      eventType: 'PUSH',
      title: 'Database migration: add permissions table and update Role enum',
      body: 'Added a new permissions table with RBAC support. Updated the Role enum to include new roles (AUDITOR, OPERATOR). Modified the User table to add permission relation.',
      language: 'en',
    },
    expected: {
      category: ['REFACTOR'],
      riskLevel: ['HIGH'],
      suggestedAction: ['REVIEW_REQUIRED'],
    },
  },
  {
    name: 'Case 5: 安全修复 - JWT secret 泄露到日志',
    input: {
      eventType: 'PUSH',
      title: 'Fix JWT secret logged in production error messages',
      body: 'Removed JWT_SECRET from error log output in auth middleware. Added sensitive data masking to the logging utility. This was a CRITICAL security issue as the secret was being printed in plaintext to production logs.',
      language: 'en',
    },
    expected: {
      category: ['SECURITY'],
      riskLevel: ['HIGH', 'CRITICAL'],
      suggestedAction: ['NOTIFY_OWNER'],
    },
  },
  {
    name: 'Case 6: 依赖升级 - lodash 小版本更新',
    input: {
      eventType: 'PR_OPENED',
      title: 'Bump lodash from 4.17.20 to 4.17.21',
      body: 'Patch version update to fix CVE-2021-23337 in lodash. No breaking changes. All existing tests pass.',
      language: 'en',
    },
    expected: {
      category: ['DEPENDENCY'],
      riskLevel: ['LOW'],
      suggestedAction: ['SAFE_TO_IGNORE'],
    },
  },
  {
    name: 'Case 7: 新功能 - 用户管理页面',
    input: {
      eventType: 'PR_OPENED',
      title: 'Add user management page with CRUD, search and pagination',
      body: 'New feature: user management dashboard with full CRUD operations, search filtering, and server-side pagination. Includes role assignment modal and batch actions.',
      language: 'en',
    },
    expected: {
      category: ['FEATURE'],
      riskLevel: ['MEDIUM'],
      suggestedAction: ['TEST_REQUIRED'],
    },
  },
  {
    name: 'Case 8: 安全加固 - webhook 验签 timing safe compare',
    input: {
      eventType: 'PUSH',
      title: 'Add timing-safe comparison to webhook signature verification',
      body: 'Replaced standard string comparison with crypto.timingSafeEqual for HMAC signature verification in GitHub webhook handler to prevent timing attacks.',
      language: 'en',
    },
    expected: {
      category: ['SECURITY'],
      riskLevel: ['HIGH'],
      suggestedAction: ['REVIEW_REQUIRED'],
    },
  },
  {
    name: 'Case 9: Bug 修复 - 通知分页越界 500',
    input: {
      eventType: 'PR_OPENED',
      title: 'Fix notification list pagination out-of-bounds causing 500 error',
      body: 'When requesting a page beyond available data, the API returns a 500 Internal Server Error instead of an empty result set. This fix adds bounds checking to the pagination logic.',
      language: 'en',
    },
    expected: {
      category: ['BUGFIX'],
      riskLevel: ['MEDIUM'],
      suggestedAction: ['TEST_REQUIRED'],
    },
  },
  {
    name: 'Case 10: Feature Request - 导出 PDF',
    input: {
      eventType: 'ISSUE_OPENED',
      title: 'Feature request: add PDF export for reports',
      body: 'Users have requested the ability to export weekly reports as PDF documents. This would require integrating a PDF generation library and creating export templates.',
      language: 'en',
    },
    expected: {
      category: ['FEATURE'],
      riskLevel: ['LOW'],
      suggestedAction: ['SAFE_TO_IGNORE'],
    },
  },
];
