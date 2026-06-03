// WebhookProxy 本地安全测试(无需隧道/网络):验证仅 /webhooks 放行 + 防路径穿越。
// 需先 `pnpm --filter @repo-pulse/electron build:main`,且本地 API 在 127.0.0.1:3001。
const http = require('node:http');
const { WebhookProxy } = require('../dist/main/lib/tunnel/webhook-proxy.js');

// 用字面 path 发请求(node 不会归一化请求行里的 path,故能模拟原始穿越路径)。
function req(port, path, method = 'GET', body) {
  return new Promise((resolve) => {
    const r = http.request(
      { host: '127.0.0.1', port, path, method, headers: body ? { 'content-type': 'application/json' } : {} },
      (res) => { res.resume(); resolve(res.statusCode); },
    );
    r.on('error', () => resolve(0));
    if (body) r.write(body);
    r.end();
  });
}

(async () => {
  const proxy = new WebhookProxy({ targetOrigin: 'http://127.0.0.1:3001' });
  const { port } = await proxy.start();
  const cases = [
    ['/auth/me 直接', '/auth/me', 'GET', undefined, (c) => c === 404],
    ['/webhooks/../auth/me 穿越', '/webhooks/../auth/me', 'GET', undefined, (c) => c === 404],
    ['/webhooksXYZ 前缀粘连', '/webhooksXYZ', 'GET', undefined, (c) => c === 404],
    ['/webhooks/github 转发', '/webhooks/github', 'POST', JSON.stringify({ repository: { id: 0, full_name: 'x/y' } }), (c) => c !== 0 && c !== 404 && c < 500],
  ];
  let ok = true;
  for (const [name, path, method, body, pass] of cases) {
    const code = await req(port, path, method, body);
    const good = pass(code);
    if (!good) ok = false;
    console.log(`  ${good ? 'PASS' : 'FAIL'}  ${name} → HTTP ${code}`);
  }
  await proxy.stop();
  console.log(`PROXY-SEC ${ok ? 'PASS' : 'FAIL'}`);
  process.exit(ok ? 0 : 1);
})();
