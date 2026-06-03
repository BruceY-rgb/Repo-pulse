// 下载当前平台的 cloudflared 二进制到 apps/electron/resources/bin/。
// 用途:dev 本地获取 + 打包前(electron-builder beforePack)预置二进制。
// 二进制不入 git(见 apps/electron/.gitignore),靠本脚本按需拉取。
import { mkdir, chmod, rename, rm, access } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const BASE = 'https://github.com/cloudflare/cloudflared/releases/latest/download';

// platform-arch -> { asset, tgz, out }
const MAP = {
  'darwin-arm64': { asset: 'cloudflared-darwin-arm64.tgz', tgz: true, out: 'cloudflared' },
  'darwin-x64': { asset: 'cloudflared-darwin-amd64.tgz', tgz: true, out: 'cloudflared' },
  'linux-x64': { asset: 'cloudflared-linux-amd64', tgz: false, out: 'cloudflared' },
  'linux-arm64': { asset: 'cloudflared-linux-arm64', tgz: false, out: 'cloudflared' },
  'win32-x64': { asset: 'cloudflared-windows-amd64.exe', tgz: false, out: 'cloudflared.exe' },
};

const key = `${process.platform}-${process.arch}`;
const m = MAP[key];
if (!m) {
  console.error(`[fetch-cloudflared] unsupported platform: ${key}`);
  process.exit(1);
}

const binDir = path.resolve(import.meta.dirname, '..', 'resources', 'bin');
const outPath = path.join(binDir, m.out);

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function main() {
  await mkdir(binDir, { recursive: true });
  if (await exists(outPath) && !process.argv.includes('--force')) {
    console.log(`[fetch-cloudflared] already present: ${outPath} (use --force to re-download)`);
    return;
  }
  const url = `${BASE}/${m.asset}`;
  console.log(`[fetch-cloudflared] downloading ${url}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) {
    console.error(`[fetch-cloudflared] download failed: HTTP ${res.status}`);
    process.exit(1);
  }
  if (m.tgz) {
    const tmpTgz = path.join(binDir, '.cloudflared.tgz');
    await pipeline(Readable.fromWeb(res.body), createWriteStream(tmpTgz));
    const r = spawnSync('tar', ['xzf', tmpTgz, '-C', binDir], { stdio: 'inherit' });
    await rm(tmpTgz, { force: true });
    if (r.status !== 0) { console.error('[fetch-cloudflared] tar extract failed'); process.exit(1); }
    // tgz 内文件名即 cloudflared;若与 out 不同则重命名
    const extracted = path.join(binDir, 'cloudflared');
    if (extracted !== outPath && (await exists(extracted))) await rename(extracted, outPath);
  } else {
    await pipeline(Readable.fromWeb(res.body), createWriteStream(outPath));
  }
  if (process.platform !== 'win32') await chmod(outPath, 0o755);
  console.log(`[fetch-cloudflared] ready: ${outPath}`);
}

main().catch((e) => { console.error('[fetch-cloudflared]', e); process.exit(1); });
