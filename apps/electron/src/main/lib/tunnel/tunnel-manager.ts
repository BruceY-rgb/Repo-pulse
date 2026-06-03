import { spawn, type ChildProcessByStdio } from 'node:child_process';
import * as http from 'node:http';
import * as https from 'node:https';
import { Resolver } from 'node:dns/promises';
import { URL } from 'node:url';
import type { Readable } from 'node:stream';
import type { TunnelManagerOptions, TunnelState, TunnelStatus } from './types';

/** 从 cloudflared 输出里抓 quick tunnel 公网 URL。 */
const TRYCLOUDFLARE_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;
/**
 * 启动总超时：cloudflared 至少要在此窗口内打印出 URL。
 * 注意：URL 出现后边缘就绪探测是 best-effort，超时不再致命（见 start()）。
 */
const START_TIMEOUT_MS = 45_000;
/** 边缘就绪探测：单次 HTTP 请求超时。 */
const PROBE_TIMEOUT_MS = 5_000;
/** 边缘就绪探测的最大尝试次数（实测 URL 出现后约需 3–6s 才真正可服务）。 */
const PROBE_MAX_ATTEMPTS = 20;
/** 两次探测之间的间隔。 */
const PROBE_INTERVAL_MS = 1_500;
/**
 * 边缘就绪探测的总时间预算（用于「未确认即继续」告警文案，仅展示用途）。
 * 探不到不致命：到此预算仍未确认则告警后继续置 running（见 waitForEdge / start）。
 */
const EDGE_PROBE_BUDGET_MS = PROBE_MAX_ATTEMPTS * (PROBE_TIMEOUT_MS + PROBE_INTERVAL_MS);
const DEFAULT_MAX_RETRIES = 3;
/**
 * 公共 DNS 兜底解析器：部分受限网络的默认解析器不解析 *.trycloudflare.com
 * （返回 NXDOMAIN），导致系统级 fetch/lookup 拿不到边缘 IP。此时改用公共
 * 解析器解出 IP，再按 IP 直连（HTTP Host + TLS SNI 仍用原主机名，保证边缘路由）。
 */
const PUBLIC_DNS_SERVERS = ['1.1.1.1', '8.8.8.8'];

/**
 * TunnelManager —— cloudflared quick tunnel 生命周期管理（纯 node）。
 *
 * 负责 spawn cloudflared、从其输出抓公网 URL、轮询确认边缘路由真正生效、并把
 * 状态变更回调给上层（M2 接 IPC）。cloudflared 路径由调用方注入，本模块不解析
 * electron 资源路径，因此可独立 spawn 测试。绝不 import electron。
 *
 * 关键时序：cloudflared 打印出 *.trycloudflare.com 后，cloudflare 边缘往往还要
 * 3–6s 才把路由真正挂上；过早 resolve 会导致首批 webhook 命中 cloudflare 错误页。
 * 因此抓到 URL 后还要对 `<url>/` 反复探测，拿到任意 HTTP 响应码才置 running。
 */
export class TunnelManager {
  private readonly cloudflaredPath: string;
  private readonly targetPort: number;
  private readonly onStatus?: (status: TunnelStatus) => void;
  private readonly maxRetries: number;

  /** stdio = ['ignore','pipe','pipe'] → stdin 为 null，stdout/stderr 为 Readable。 */
  private child: ChildProcessByStdio<null, Readable, Readable> | null = null;
  private state: TunnelState = 'idle';
  private publicUrl: string | null = null;
  private retries = 0;
  /** 主动 stop/dispose 标志：用于区分「我们要它退」与「它异常崩了」。 */
  private stopping = false;

  constructor(options: TunnelManagerOptions) {
    this.cloudflaredPath = options.cloudflaredPath;
    this.targetPort = options.targetPort;
    this.onStatus = options.onStatus;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  /**
   * 启动隧道：spawn cloudflared → 抓 URL → 尽力探测边缘就绪 → resolve publicUrl。
   *
   * 边缘就绪探测是 best-effort：探到可达则照常置 running；本机在探测预算内探不到
   * （受限网络对 *.trycloudflare.com 解不出 / 边缘从本机不可达）也**不**视为失败 ——
   * cloudflared 已打印 URL 即代表它本身已连上 cloudflare 边缘，而真正访问隧道的是
   * GitHub（公网），不是本机。故此时打一条告警后仍以已捕获 URL 置 running 并 resolve。
   *
   * 仅在 cloudflared 启动阶段异常退出 / spawn 失败 / 总超时（连 URL 都没出现）时才 reject。
   */
  start(): Promise<string> {
    if (this.state === 'running' && this.publicUrl) {
      return Promise.resolve(this.publicUrl);
    }
    this.stopping = false;
    this.setState('starting');

    return new Promise<string>((resolve, reject) => {
      let settled = false;
      let capturedUrl: string | null = null;

      const child = spawn(
        this.cloudflaredPath,
        [
          'tunnel',
          '--url',
          `http://127.0.0.1:${this.targetPort}`,
          '--no-autoupdate',
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
      this.child = child;

      // 启动总超时只守「URL 必须出现」：URL 一出现就清掉它（见 onChunk），
      // 之后边缘就绪探测自带预算且超时非致命，不再受此计时器约束。
      const overallTimer = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        // 连 URL 都没出现 → cloudflared 没起来，仍按失败处理。
        this.fail('tunnel start timed out before url appeared');
        reject(new Error('[tunnel-manager] start timed out'));
      }, START_TIMEOUT_MS);

      const onChunk = (chunk: Buffer): void => {
        const text = chunk.toString();
        if (capturedUrl) {
          return;
        }
        const match = TRYCLOUDFLARE_RE.exec(text);
        if (!match) {
          return;
        }
        capturedUrl = match[0];
        // URL 已出现 → cloudflared 已连边缘；解除「URL 必须出现」超时，避免它误判后续探测。
        clearTimeout(overallTimer);
        console.log(`[tunnel-manager] captured url=${capturedUrl}, probing edge readiness...`);
        // 抓到 URL 不一定立即可服务；尽力探测边缘路由生效（探到则有价值），
        // 但探不到也不致命：cloudflared 已打印 URL=已连边缘，访问隧道的是 GitHub（公网）非本机。
        void this.waitForEdge(capturedUrl).then((ready) => {
          if (settled) {
            return;
          }
          settled = true;
          if (!ready) {
            // best-effort：本机未在预算内确认可达 → 告警后仍以已捕获 URL 置 running。
            // 不 reject、不杀 cloudflared、不计为失败（不触发 maxRetries）。
            console.warn(
              `[tunnel-manager] edge not locally confirmed within ${EDGE_PROBE_BUDGET_MS}ms; ` +
                'proceeding with url (GitHub reaches the tunnel externally)',
            );
          }
          this.publicUrl = capturedUrl;
          this.retries = 0;
          this.setState('running');
          console.log(`[tunnel-manager] running publicUrl=${capturedUrl}`);
          resolve(capturedUrl as string);
        });
      };

      child.stdout.on('data', onChunk);
      child.stderr.on('data', onChunk);

      child.on('error', (error: Error) => {
        console.warn('[tunnel-manager] spawn error', error.message);
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(overallTimer);
        this.fail(`failed to spawn cloudflared: ${error.message}`);
        reject(error);
      });

      child.on('exit', (code, signal) => {
        this.child = null;
        // 启动阶段就退出 → 视为启动失败。
        if (!settled) {
          settled = true;
          clearTimeout(overallTimer);
          this.fail(`cloudflared exited during startup (code=${code ?? 'null'} signal=${signal ?? 'null'})`);
          reject(new Error('[tunnel-manager] cloudflared exited during startup'));
          return;
        }
        // 主动停止 → 不当作错误，也不重启。
        if (this.stopping) {
          return;
        }
        // 运行期异常退出 → 置 error，并在 maxRetries 内尝试重启。
        console.warn(`[tunnel-manager] cloudflared exited unexpectedly (code=${code ?? 'null'} signal=${signal ?? 'null'})`);
        this.publicUrl = null;
        this.setState('error', 'cloudflared exited unexpectedly');
        this.maybeRetry();
      });
    });
  }

  /** 先 stop 再 start。 */
  async restart(): Promise<string> {
    await this.stop();
    return this.start();
  }

  /** 主动停止隧道（kill 子进程并等待退出）。幂等。 */
  async stop(): Promise<void> {
    this.stopping = true;
    await this.killChild();
    this.publicUrl = null;
    this.setState('stopped');
  }

  /** 清理：kill 子进程，不再回调（应用退出/对象销毁时调用）。 */
  dispose(): void {
    this.stopping = true;
    const child = this.child;
    this.child = null;
    if (child && child.exitCode === null && child.signalCode === null) {
      child.removeAllListeners();
      // 先 SIGTERM 优雅退出，兜底 SIGKILL 防僵尸。
      child.kill('SIGTERM');
      const killTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL');
        }
      }, 2_000);
      killTimer.unref();
    }
    this.publicUrl = null;
    this.state = 'stopped';
  }

  getPublicUrl(): string | null {
    return this.publicUrl;
  }

  getState(): TunnelState {
    return this.state;
  }

  /** kill 子进程并等待其真正退出，确保不留僵尸。 */
  private killChild(): Promise<void> {
    const child = this.child;
    this.child = null;
    if (!child || (child.exitCode !== null || child.signalCode !== null)) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      let done = false;
      const finish = (): void => {
        if (done) {
          return;
        }
        done = true;
        resolve();
      };
      child.once('exit', finish);
      child.kill('SIGTERM');
      const killTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL');
        }
        // SIGKILL 后仍兜底 resolve，避免 stop 永久挂起。
        finish();
      }, 2_000);
      killTimer.unref();
    });
  }

  /** 运行期异常退出后的自动重启（maxRetries 内，简单实现）。 */
  private maybeRetry(): void {
    if (this.stopping || this.retries >= this.maxRetries) {
      return;
    }
    this.retries += 1;
    console.log(`[tunnel-manager] retrying (${this.retries}/${this.maxRetries})...`);
    void this.start().catch((error: Error) => {
      console.warn('[tunnel-manager] retry failed', error.message);
    });
  }

  /**
   * 轮询公网 URL，拿到任意 HTTP 响应码即认为边缘路由已生效。
   * 先用系统解析器直连；若系统解析器解不出主机（受限网络对 *.trycloudflare.com
   * 返回 NXDOMAIN），则用公共解析器解出 IP 后按 IP 直连兜底。
   */
  private async waitForEdge(url: string): Promise<boolean> {
    let host = '';
    try {
      host = new URL('/', url).hostname;
    } catch {
      return false;
    }
    /** 公共解析器解出的边缘 IP（系统解析器失败时启用，解出后缓存复用）。 */
    let fallbackIp: string | null = null;

    for (let attempt = 1; attempt <= PROBE_MAX_ATTEMPTS; attempt += 1) {
      // 1) 系统解析器直连。
      const status = await this.probeOnce(url, null);
      if (status !== null) {
        console.log(`[tunnel-manager] edge ready after ${attempt} probe(s) (status=${status})`);
        return true;
      }
      // 2) 系统解析器失败：用公共解析器解 IP（DNS 记录可能要数秒才传播，逐次重试），
      //    解出后缓存并按 IP 直连。
      if (!fallbackIp) {
        fallbackIp = await this.resolveViaPublicDns(host);
        if (fallbackIp) {
          console.log(`[tunnel-manager] system resolver failed; using public-dns ip=${fallbackIp}`);
        }
      }
      if (fallbackIp) {
        const fbStatus = await this.probeOnce(url, fallbackIp);
        if (fbStatus !== null) {
          console.log(
            `[tunnel-manager] edge ready (via public-dns) after ${attempt} probe(s) (status=${fbStatus})`,
          );
          return true;
        }
      }
      await delay(PROBE_INTERVAL_MS);
    }
    return false;
  }

  /**
   * 对 `<url>/` 发一次 GET，带超时；拿到任意状态码返回之，否则 null。
   * 传入 ip 时按该 IP 直连，但 HTTP Host 与 TLS SNI 仍用原主机名（保证边缘路由）。
   */
  private probeOnce(url: string, ip: string | null): Promise<number | null> {
    return new Promise<number | null>((resolve) => {
      let target: URL;
      try {
        target = new URL('/', url);
      } catch {
        resolve(null);
        return;
      }
      const isHttps = target.protocol === 'https:';
      const client = isHttps ? https : http;
      const options: https.RequestOptions = {
        protocol: target.protocol,
        hostname: ip ?? target.hostname,
        port: target.port || (isHttps ? 443 : 80),
        path: '/',
        method: 'GET',
        timeout: PROBE_TIMEOUT_MS,
        headers: { host: target.hostname },
      };
      if (ip && isHttps) {
        options.servername = target.hostname; // 按 IP 直连时显式设置 SNI。
      }
      const req = client.request(options, (res) => {
        const status = res.statusCode ?? null;
        res.resume(); // 丢弃 body，释放 socket。
        resolve(status);
      });
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
      req.on('error', () => {
        resolve(null);
      });
      req.end();
    });
  }

  /** 用公共 DNS 解出主机的 IPv4（系统解析器失败时兜底）；解析失败返回 null。 */
  private async resolveViaPublicDns(host: string): Promise<string | null> {
    for (const server of PUBLIC_DNS_SERVERS) {
      try {
        const resolver = new Resolver({ timeout: PROBE_TIMEOUT_MS, tries: 1 });
        resolver.setServers([server]);
        const addresses = await resolver.resolve4(host);
        if (addresses.length > 0) {
          return addresses[0];
        }
      } catch {
        // 换下一个公共解析器。
      }
    }
    return null;
  }

  /** 置 error 状态并回调（启动失败统一出口）。 */
  private fail(message: string): void {
    console.warn(`[tunnel-manager] ${message}`);
    this.publicUrl = null;
    void this.killChild();
    this.setState('error', message);
  }

  /** 更新状态并触发 onStatus 回调。 */
  private setState(state: TunnelState, error?: string): void {
    this.state = state;
    const status: TunnelStatus = { state };
    if (state === 'running' && this.publicUrl) {
      status.publicUrl = this.publicUrl;
    }
    if (state === 'error' && error) {
      status.error = error;
    }
    this.onStatus?.(status);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref();
  });
}
