/**
 * 账号作用域的 localStorage 帮助器。
 *
 * 同一台主机上多个账号共用同一个 localStorage。若 key 不带账号标识，
 * 上一个账号写入的项目列表 / 会话 / 收藏 / 置顶 / 工作区关联等会被下一个
 * 账号直接读到，造成跨账号数据泄漏（新账号看起来「已经配置了别人的 GitHub
 * 仓库」）。这里用「基础 key + 当前账号 id」生成命名空间化的 key，使各账号
 * 互不可见，且新账号读不到任何旧数据（默认即空）。
 *
 * 当前账号 id 由认证流程（登录 / 注册 / 路由守卫）通过 setActiveAccountId 注入；
 * 登录态未知时用 'anon' 兜底，确保未登录写入也不会落到会被真实账号读到的全局 key。
 */

let activeAccountId: string | null = null;
let legacyKeysMigrated = false;

// 升级到「按账号命名空间」之前写下的全局账号数据 key。前两类是固定 key，
// 后一类是带 repoId 后缀的前缀 key。命名空间化后的新 key 一律含 '::'，据此区分。
const LEGACY_EXACT_KEYS = [
  'repo-pulse:agent-projects',
  'repo-pulse-pinned-repos',
  'repo-pulse:favorite-events',
];
const LEGACY_PREFIX_KEYS = [
  'repo-pulse:agent-sessions:',
  'repo-pulse:active-agent-session:',
  'repo-pulse:agent-workspace-memory:',
];

function isLegacyAccountDataKey(key: string): boolean {
  if (key.includes('::')) return false; // 已命名空间化的新 key，跳过
  if (LEGACY_EXACT_KEYS.includes(key)) return true;
  return LEGACY_PREFIX_KEYS.some((prefix) => key.startsWith(prefix));
}

/**
 * 一次性迁移：把升级前写下的「全局（未命名空间化）」账号数据认领到首个登录的账号名下，
 * 随后删除全局 key——既让既有账号不丢数据，又保证后续其它账号读不到（维持隔离）。
 * 全局 key 删除后即为空操作，因此重复调用安全。
 */
function migrateLegacyGlobalKeys(accountId: string): void {
  if (legacyKeysMigrated || !accountId) return;
  legacyKeysMigrated = true;
  try {
    const legacyKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && isLegacyAccountDataKey(key)) legacyKeys.push(key);
    }
    for (const legacyKey of legacyKeys) {
      const value = localStorage.getItem(legacyKey);
      if (value !== null) {
        const targetKey = `${legacyKey}::${accountId}`;
        // 仅当目标尚不存在时迁移，避免覆盖该账号已有数据
        if (localStorage.getItem(targetKey) === null) {
          localStorage.setItem(targetKey, value);
        }
      }
      // 认领后删除全局 key，使后续其它账号读不到（保持隔离）
      localStorage.removeItem(legacyKey);
    }
  } catch {
    // localStorage 不可用时静默跳过
  }
}

export function setActiveAccountId(userId: string | null | undefined): void {
  activeAccountId = userId && userId.trim() ? userId : null;
  if (activeAccountId) {
    migrateLegacyGlobalKeys(activeAccountId);
  }
}

export function getActiveAccountId(): string | null {
  return activeAccountId;
}

/** 为账号数据生成命名空间化的 localStorage key。 */
export function accountScopedKey(baseKey: string): string {
  return `${baseKey}::${activeAccountId ?? 'anon'}`;
}

export const accountStorage = {
  getItem(baseKey: string): string | null {
    return localStorage.getItem(accountScopedKey(baseKey));
  },
  setItem(baseKey: string, value: string): void {
    localStorage.setItem(accountScopedKey(baseKey), value);
  },
  removeItem(baseKey: string): void {
    localStorage.removeItem(accountScopedKey(baseKey));
  },
};
