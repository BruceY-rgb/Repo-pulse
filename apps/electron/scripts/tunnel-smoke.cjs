// 自动隧道 M1 冒烟脚本（独立 CommonJS，require 编译后的 dist 模块）。
//
// 端到端验证：WebhookProxy 起临时端口 → TunnelManager 起 cloudflared quick tunnel →
//   A(安全) publicUrl + '/auth/me' 不应被转发（断言 status !== 200，理想 404）；
//   B(转发) publicUrl + '/webhooks/github' POST 应打到本地 API（断言拿到来自 API 的响应）。
// 需要本地 API 在 127.0.0.1:3001 运行；会真起隧道，约 10–20s。
//
// 注意：请求经公网 URL 发出，需解析 *.trycloudflare.com。部分受限网络的系统解析器
// 对其返回 NXDOMAIN，故这里与 TunnelManager 一致——系统解析器失败时用公共解析器
// 解出 IP，再按 IP 直连（HTTP Host + TLS SNI 仍用原主机名）。
const path = require('node:path');
const fs = require('node:fs');
const https = require('node:https');
const { Resolver } = require('node:dns/promises');

const repoElectronRoot = path.resolve(__dirname, '..');
const cloudflaredPath = path.join(repoElectronRoot, 'resources', 'bin', 'cloudflared');

const { WebhookProxy } = require('../dist/main/lib/tunnel/webhook-proxy.js');
const { TunnelManager } = require('../dist/main/lib/tunnel/tunnel-manager.js');

const PUBLIC_DNS_SERVERS = ['1.1.1.1', '8.8.8.8'];

function fail(message) {
  console.error(`[tunnel-smoke] ${message}`);
  process.exit(1);
}

async function resolveViaPublicDns(host) {
  for (const server of PUBLIC_DNS_SERVERS) {
    try {
      const resolver = new Resolver({ timeout: 5000, tries: 1 });
      resolver.setServers([server]);
      const addresses = await resolver.resolve4(host);
      if (addresses.length > 0) return addresses[0];
    } catch {
      // 换下一个公共解析器
    }
  }
  return null;
}

// 经公网 URL 发一次 HTTPS 请求；系统解析失败则用公共解析器解出 IP 后按 IP 直连。
async function requestViaTunnel(publicUrl, pathName, method, headers, body) {
  const target = new URL(pathName, publicUrl);
  const ip = await resolveViaPublicDns(target.hostname); // 兜底 IP（系统解析器可用时也无妨）
  return new Promise((resolve, reject) => {
    const reqHeaders = Object.assign({ host: target.hostname }, headers || {});
    if (body) reqHeaders['content-length'] = Buffer.byteLength(body);
    const options = {
      hostname: ip || target.hostname,
      port: 443,
      path: target.pathname,
      method,
      headers: reqHeaders,
      timeout: 10000,
      servername: target.hostname, // 按 IP 直连时显式 SNI
    };
    const req = https.request(options, (res) => {
      res.resume();
      resolve({ status: res.statusCode || 0, server: String(res.headers.server || '') });
    });
    req.on('timeout', () => { req.destroy(new Error('request timeout')); });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  if (!fs.existsSync(cloudflaredPath)) {
    fail(`cloudflared not found at ${cloudflaredPath} (run: pnpm --filter @repo-pulse/electron fetch:cloudflared)`);
  }

  const proxy = new WebhookProxy({ targetOrigin: 'http://127.0.0.1:3001' });
  const { port } = await proxy.start();
  console.log(`[tunnel-smoke] webhook-proxy port=${port}`);

  const tunnel = new TunnelManager({
    cloudflaredPath,
    targetPort: port,
    onStatus: (s) => console.log(`[tunnel-smoke] tunnel status=${s.state}${s.error ? ` error=${s.error}` : ''}`),
  });

  let publicUrl = '';
  let aPass = false;
  let bPass = false;

  try {
    publicUrl = await tunnel.start();
    console.log(`[tunnel-smoke] publicUrl=${publicUrl}`);

    // 测试 A（安全）：非 webhook 路径不应被反代转发（理想 404，由反代生成）。
    try {
      const resA = await requestViaTunnel(publicUrl, '/auth/me', 'GET');
      aPass = resA.status !== 200;
      console.log(`[tunnel-smoke] A /auth/me status=${resA.status} server=${resA.server || '(none)'} (expect !==200)`);
    } catch (err) {
      console.error('[tunnel-smoke] A request error', err && err.message);
      aPass = false;
    }

    // 测试 B（转发）：webhook 路径应打到本地 API，拿到真实响应码（200 或 4xx，非 cloudflare 错误页）。
    try {
      const body = JSON.stringify({ repository: { id: 0, full_name: 'smoke/test' } });
      const resB = await requestViaTunnel(
        publicUrl,
        '/webhooks/github',
        'POST',
        { 'content-type': 'application/json', 'x-github-event': 'ping' },
        body,
      );
      const okStatus = resB.status === 200 || (resB.status >= 400 && resB.status < 500);
      // cloudflare 边缘错误页通常是 5xx；本地 API 经隧道返回的 200/4xx 才算打通。
      const looksLikeCloudflareError = resB.status >= 500;
      bPass = okStatus && !looksLikeCloudflareError;
      console.log(`[tunnel-smoke] B /webhooks/github status=${resB.status} server=${resB.server || '(none)'} (expect 200 or 4xx from local API)`);
    } catch (err) {
      console.error('[tunnel-smoke] B request error', err && err.message);
      bPass = false;
    }
  } catch (err) {
    console.error('[tunnel-smoke] tunnel start failed', err && err.message);
  } finally {
    tunnel.dispose();
    await tunnel.stop();
    await proxy.stop();
  }

  console.log(
    `SMOKE A(security)=${aPass ? 'PASS' : 'FAIL'} B(forward)=${bPass ? 'PASS' : 'FAIL'} publicUrl=${publicUrl || '(none)'}`,
  );
  process.exit(aPass && bPass ? 0 : 1);
}

main().catch((err) => {
  console.error('[tunnel-smoke] fatal', err && err.stack ? err.stack : err);
  process.exit(1);
});
