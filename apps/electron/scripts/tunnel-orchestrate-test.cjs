// TunnelOrchestrator 集成测试(需 dev API 在 127.0.0.1:3001 + TEST_TOKEN 环境变量)。
// 仅测可逆的 setApiUrl(写 api-url 配置);webhook 重建(rebuildAll/rebuildOne)会动真实 GitHub 仓库,
// 不在此自动跑,留 M5 端到端。用法:TEST_TOKEN=<jwt> node tunnel-orchestrate-test.cjs <testUrl>
const { TunnelOrchestrator } = require('../dist/main/lib/tunnel/tunnel-orchestrator.js');

const token = process.env.TEST_TOKEN || '';
const testUrl = process.argv[2];
if (!token || !testUrl) {
  console.error('usage: TEST_TOKEN=<jwt> node tunnel-orchestrate-test.cjs <testUrl>');
  process.exit(2);
}

(async () => {
  const orch = new TunnelOrchestrator({
    apiBaseUrl: 'http://127.0.0.1:3001',
    getToken: async () => token,
  });
  const r = await orch.setApiUrl(testUrl);
  console.log('ORCH setApiUrl =>', JSON.stringify(r));
  process.exit(r.ok ? 0 : 1);
})();
