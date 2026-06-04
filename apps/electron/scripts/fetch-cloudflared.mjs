// 下载当前平台的 cloudflared 二进制到 apps/electron/resources/bin/。
// 用途:dev 本地获取 + 打包前(electron-builder beforePack)预置二进制。
// 二进制不入 git(见 apps/electron/.gitignore),靠本脚本按需拉取。
import { mkdir, chmod, rename, rm, access } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

// 版本：默认 latest；用 CLOUDFLARED_VERSION 固定（如 2026.5.2）以保证各机/CI 一致可复现。
const VERSION = (process.env.CLOUDFLARED_VERSION || 'latest').trim();
const BASE =
  VERSION === 'latest'
    ? 'https://github.com/cloudflare/cloudflared/releases/latest/download'
    : `https://github.com/cloudflare/cloudflared/releases/download/${VERSION}`;

// platform-arch -> { asset, tgz, out }
const MAP = {
  'darwin-arm64': { asset: 'cloudflared-darwin-arm64.tgz', tgz: true, out: 'cloudflared' },
  'darwin-x64': { asset: 'cloudflared-darwin-amd64.tgz', tgz: true, out: 'cloudflared' },
  'linux-x64': { asset: 'cloudflared-linux-amd64', tgz: false, out: 'cloudflared' },
  'linux-arm64': { asset: 'cloudflared-linux-arm64', tgz: false, out: 'cloudflared' },
  'linux-arm': { asset: 'cloudflared-linux-arm', tgz: false, out: 'cloudflared' },
  'win32-x64': { asset: 'cloudflared-windows-amd64.exe', tgz: false, out: 'cloudflared.exe' },
};

// 目标平台/架构：默认当前构建机；交叉出包时用 CLOUDFLARED_PLATFORM / CLOUDFLARED_ARCH 覆盖
// （electron-builder 各 target 各自拉取，避免装错架构二进制）。
const PLATFORM = (process.env.CLOUDFLARED_PLATFORM || process.platform).trim();
const ARCH = (process.env.CLOUDFLARED_ARCH || process.arch).trim();
const key = `${PLATFORM}-${ARCH}`;
const m = MAP[key];
if (!m) {
  console.error(
    `[fetch-cloudflared] unsupported platform: ${key} (supported: ${Object.keys(MAP).join(', ')})`,
  );
  process.exit(1);
}
console.log(`[fetch-cloudflared] target=${key} version=${VERSION}`);

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
