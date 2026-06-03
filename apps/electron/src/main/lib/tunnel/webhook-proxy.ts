import * as http from 'node:http';
import { URL } from 'node:url';
import type { WebhookProxyOptions } from './types';

const DEFAULT_TARGET_ORIGIN = 'http://127.0.0.1:3001';
const DEFAULT_ALLOWED_PREFIX = '/webhooks';
const DEFAULT_HOST = '127.0.0.1';

/**
 * WebhookProxy —— 公网→本地 API 的最小反向代理（纯 node:http）。
 *
 * cloudflared quick tunnel 会把整条公网 URL 暴露出来，但我们只想让 GitHub
 * webhook 进到本地 API，绝不想把 `/auth/*`、`/repositories/*` 等内部接口也暴露。
 * 因此隧道不直接指向本地 API，而是指向本反代：
 *   - 仅当 req.url 以 allowedPathPrefix（默认 '/webhooks'）开头时才转发，
 *     其它任何路径一律 404（安全闸门）。
 *   - 转发时 method/headers 原样透传，尤其保留 GitHub 验签所需的
 *     x-hub-signature-256 / x-github-event / content-type；
 *     原始 body 用流 pipe，不解析（验签基于 Raw Body）。
 *   - 监听 127.0.0.1 的临时端口（port 0 由系统分配），只对本机 cloudflared 可见。
 */
export class WebhookProxy {
  private readonly targetOrigin: string;
  private readonly allowedPathPrefix: string;
  private readonly host: string;
  private server: http.Server | null = null;
  private port: number | null = null;

  constructor(options: WebhookProxyOptions = {}) {
    this.targetOrigin = options.targetOrigin ?? DEFAULT_TARGET_ORIGIN;
    this.allowedPathPrefix = options.allowedPathPrefix ?? DEFAULT_ALLOWED_PREFIX;
    this.host = options.host ?? DEFAULT_HOST;
  }

  /** 启动反代，监听临时端口。返回实际分配到的端口。幂等：已启动则直接返回当前端口。 */
  start(): Promise<{ port: number }> {
    if (this.server && this.port !== null) {
      return Promise.resolve({ port: this.port });
    }
    return new Promise<{ port: number }>((resolve, reject) => {
      const server = http.createServer((req, res) => {
        this.handle(req, res);
      });
      server.on('error', (error: Error) => {
        console.warn('[webhook-proxy] server error', error.message);
        reject(error);
      });
      // port 0 → 系统分配临时端口。
      server.listen(0, this.host, () => {
        const address = server.address();
        if (address === null || typeof address === 'string') {
          reject(new Error('[webhook-proxy] failed to resolve listening port'));
          return;
        }
        this.server = server;
        this.port = address.port;
        console.log(`[webhook-proxy] listening on ${this.host}:${this.port} → ${this.targetOrigin}`);
        resolve({ port: address.port });
      });
    });
  }

  /** 关闭反代。幂等。 */
  stop(): Promise<void> {
    const server = this.server;
    if (!server) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      server.close(() => {
        console.log('[webhook-proxy] stopped');
        this.server = null;
        this.port = null;
        resolve();
      });
    });
  }

  getPort(): number | null {
    return this.port;
  }

  /** 处理单个请求：闸门判定 → 透传转发 → 原样回写。 */
  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    const rawUrl = req.url ?? '/';

    // 先解析+归一化,再判闸门:必须用归一化后的 pathname 判定,
    // 否则 `/webhooks/../auth/me` 这类路径穿越会过 startsWith 检查、
    // 却被 new URL() 归一化成 `/auth/me` 转发出去 → 绕过安全闸门。
    let target: URL;
    try {
      target = new URL(rawUrl, this.targetOrigin);
    } catch {
      res.writeHead(400, { 'content-type': 'text/plain' });
      res.end('Bad Request');
      return;
    }

    // 安全闸门:仅 /webhooks 前缀放行(对归一化 pathname 判定),其它一律 404(不转发)。
    if (!this.isAllowed(target.pathname)) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const upstream = http.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        method: req.method,
        path: `${target.pathname}${target.search}`,
        // headers 原样透传（含 x-hub-signature-256 / x-github-event / content-type）。
        headers: req.headers,
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
        upstreamRes.pipe(res);
      },
    );

    upstream.on('error', (error: Error) => {
      console.warn('[webhook-proxy] upstream error', error.message);
      if (!res.headersSent) {
        res.writeHead(502, { 'content-type': 'text/plain' });
      }
      res.end('Bad Gateway');
    });

    // 原始请求体用流 pipe，不解析（GitHub 验签基于 Raw Body）。
    req.pipe(upstream);
  }

  /** 路径是否落在允许的前缀下（忽略 query string）。 */
  private isAllowed(rawUrl: string): boolean {
    const pathname = rawUrl.split('?', 1)[0] ?? '';
    return pathname === this.allowedPathPrefix || pathname.startsWith(`${this.allowedPathPrefix}/`);
  }
}
