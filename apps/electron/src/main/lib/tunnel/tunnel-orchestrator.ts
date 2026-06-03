import type { OrchestratorResult } from './types';

/** TunnelOrchestrator 构造参数。 */
export interface TunnelOrchestratorOptions {
  /** 本地后端 API 基址（复用 realtime-bridge 的 API_BASE_URL，禁尾斜杠依赖：内部统一归一化）。 */
  apiBaseUrl: string;
  /**
   * 取当前 access_token。必须「每次现取」（与 realtime-bridge.readAccessToken 同款，
   * 每次重读 HttpOnly Cookie），以适配 token 轮换；返回 null 表示未登录。
   */
  getToken: () => Promise<string | null>;
}

const LOG = '[tunnel-orchestrator]';

/**
 * TunnelOrchestrator —— 「拿到隧道公网 URL 后，让后端的 webhook 指向它」的编排器（纯 node）。
 *
 * cloudflared quick tunnel 的公网 URL 每次启动都随机，因此每次隧道就绪后都要：
 *   1. setApiUrl：把 `${publicUrl}` 写进后端 AppConfig 的 API_URL（进程级，影响后续
 *      webhook 回调地址拼接 `${API_URL}/webhooks/github`）。需调用者为 ADMIN（403→needsAdmin）。
 *   2. rebuildAll：对调用者名下所有 active 仓库逐个删旧建新 webhook（回调地址自动取新 API_URL）。
 *
 * 所有请求都带 `Authorization: Bearer <token>`，token 每次现取（不缓存），URL 去尾斜杠归一化。
 * 本模块绝不 import electron——token 与 apiBaseUrl 由调用方（main.ts）注入，从而可独立测试。
 */
export class TunnelOrchestrator {
  private readonly apiBaseUrl: string;
  private readonly getToken: () => Promise<string | null>;

  constructor(options: TunnelOrchestratorOptions) {
    this.apiBaseUrl = stripTrailingSlash(options.apiBaseUrl);
    this.getToken = options.getToken;
  }

  /**
   * 写后端 AppConfig 的 API_URL。
   * 403 视为 needsAdmin（调用者非 ADMIN）；其它非 2xx 仅置 ok=false 带 status 返回。
   */
  async setApiUrl(publicUrl: string): Promise<{ ok: boolean; status: number; needsAdmin?: boolean }> {
    const value = stripTrailingSlash(publicUrl);
    const res = await this.post('/settings/app-config/api-url', { value });
    if (!res) {
      return { ok: false, status: 0 };
    }
    if (res.status === 403) {
      console.warn(`${LOG} setApiUrl forbidden (needs ADMIN)`);
      return { ok: false, status: 403, needsAdmin: true };
    }
    const ok = res.status >= 200 && res.status < 300;
    if (!ok) {
      console.warn(`${LOG} setApiUrl failed status=${res.status}`);
    }
    return { ok, status: res.status };
  }

  /**
   * 对调用者名下所有 active 仓库批量删旧建新 webhook（回调地址自动取当前 API_URL）。
   * 后端返回 { total, succeeded, failed, failures }；这里只透出计数。
   */
  async rebuildAll(): Promise<{
    ok: boolean;
    status: number;
    total?: number;
    succeeded?: number;
    failed?: number;
  }> {
    const res = await this.post('/repositories/batch-retry-webhooks');
    if (!res) {
      return { ok: false, status: 0 };
    }
    const ok = res.status >= 200 && res.status < 300;
    if (!ok) {
      console.warn(`${LOG} rebuildAll failed status=${res.status}`);
      return { ok, status: res.status };
    }
    const body = parseBatchBody(res.body);
    return {
      ok,
      status: res.status,
      total: body.total,
      succeeded: body.succeeded,
      failed: body.failed,
    };
  }

  /** 对单个仓库删旧建新 webhook（供定向测试 / 单仓修复使用）。 */
  async rebuildOne(repositoryId: string): Promise<{ ok: boolean; status: number }> {
    const res = await this.post(`/repositories/${encodeURIComponent(repositoryId)}/webhook`);
    if (!res) {
      return { ok: false, status: 0 };
    }
    const ok = res.status >= 200 && res.status < 300;
    if (!ok) {
      console.warn(`${LOG} rebuildOne(${repositoryId}) failed status=${res.status}`);
    }
    return { ok, status: res.status };
  }

  /**
   * 真实启动流程：先写 API_URL，成功后再批量重建 webhook。
   * 任一步失败都带状态/原因短路返回，不抛异常（调用方只 log，不崩主流程）。
   */
  async applyPublicUrl(publicUrl: string): Promise<OrchestratorResult> {
    const normalized = stripTrailingSlash(publicUrl);
    console.log(`${LOG} applyPublicUrl ${normalized}`);

    const setRes = await this.setApiUrl(normalized);
    if (!setRes.ok) {
      const result: OrchestratorResult = {
        apiUrlSet: false,
        error: setRes.needsAdmin
          ? 'set api-url forbidden: caller is not ADMIN'
          : `set api-url failed (status=${setRes.status})`,
      };
      if (setRes.needsAdmin) {
        result.needsAdmin = true;
      }
      return result;
    }

    const rebuild = await this.rebuildAll();
    if (!rebuild.ok) {
      return {
        apiUrlSet: true,
        error: `rebuild webhooks failed (status=${rebuild.status})`,
      };
    }

    console.log(
      `${LOG} done: api-url set, webhooks rebuilt total=${rebuild.total ?? '?'} ` +
        `succeeded=${rebuild.succeeded ?? '?'} failed=${rebuild.failed ?? '?'}`,
    );
    return {
      apiUrlSet: true,
      rebuild: {
        total: rebuild.total ?? 0,
        succeeded: rebuild.succeeded ?? 0,
        failed: rebuild.failed ?? 0,
      },
    };
  }

  /**
   * 统一 POST：现取 token → 带 Bearer 发请求。
   * 网络层异常（含 token 缺失）返回 null（status=0 由调用方折算）；HTTP 层任意状态码都正常返回。
   */
  private async post(path: string, body?: unknown): Promise<{ status: number; body: string } | null> {
    const token = await this.getToken();
    if (!token) {
      console.warn(`${LOG} POST ${path} skipped: no access token`);
      return null;
    }
    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
    };
    let payload: string | undefined;
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    try {
      const res = await fetch(`${this.apiBaseUrl}${path}`, {
        method: 'POST',
        headers,
        body: payload,
      });
      const text = await res.text().catch(() => '');
      return { status: res.status, body: text };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`${LOG} POST ${path} network error: ${message}`);
      return null;
    }
  }
}

/** 去掉尾部斜杠（含多个），避免与端点路径拼出双斜杠。 */
function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/** 宽松解析批量重建响应体的计数字段；缺字段不报错，交由上层用 ?? 兜底。 */
function parseBatchBody(text: string): {
  total?: number;
  succeeded?: number;
  failed?: number;
} {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      return {
        total: typeof obj.total === 'number' ? obj.total : undefined,
        succeeded: typeof obj.succeeded === 'number' ? obj.succeeded : undefined,
        failed: typeof obj.failed === 'number' ? obj.failed : undefined,
      };
    }
  } catch {
    // 非 JSON 响应：计数留空，由上层 ?? 0 兜底。
  }
  return {};
}
