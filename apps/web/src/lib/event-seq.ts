/**
 * 持久化每个仓库的"最近收到的事件 seq"，用于 WebSocket 重连时带上 sinceSeq
 * 让后端补发离线期间错过的事件。按 userId 隔离避免多账号串扰。
 */

const KEY_PREFIX = 'repo-pulse:lastSeq';

function keyFor(userId: string, repositoryId: string): string {
  return `${KEY_PREFIX}:${userId}:${repositoryId}`;
}

export function getLastSeq(
  userId: string,
  repositoryId: string,
): number | undefined {
  try {
    const raw = localStorage.getItem(keyFor(userId, repositoryId));
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  } catch {
    return undefined;
  }
}

export function setLastSeq(
  userId: string,
  repositoryId: string,
  seq: number,
): void {
  try {
    const current = getLastSeq(userId, repositoryId) ?? 0;
    // 只更新到更大的值，避免乱序到达的事件回退游标
    if (seq > current) {
      localStorage.setItem(keyFor(userId, repositoryId), String(seq));
    }
  } catch {
    // localStorage 不可用时静默忽略（隐私模式 / 配额）
  }
}
