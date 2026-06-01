import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clipboard,
  ExternalLink,
  GitBranch,
  Loader2,
  RefreshCw,
  Save,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRepositoryBranchesQuery } from '@/hooks/queries/use-repository-queries';
import { normalizeBranchOption, repositoryService } from '@/services/repository.service';
import {
  imService,
  type FeishuConnectionTestResult,
  type ImConnectionStatus,
  type ImProvider,
  type ImStageStatus,
  type ImSubscription,
  type PairingCodeResult,
} from '@/services/im.service';
import type { Repository, RepositoryBranchScopeMap, RepositoryBranchScopeOption } from '@/types/api';

type ChannelProvider = Exclude<ImProvider, 'feishu'>;

interface ImChannelIntegrationDialogProps {
  provider: ChannelProvider;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnectionChange?: (provider: ChannelProvider, connected: boolean) => void;
}

const GITHUB_EVENT_TYPES = [
  'PUSH',
  'PR_OPENED',
  'PR_MERGED',
  'PR_CLOSED',
  'PR_REVIEW',
  'ISSUE_OPENED',
  'ISSUE_CLOSED',
  'ISSUE_COMMENT',
  'RELEASE',
  'BRANCH_CREATED',
  'BRANCH_DELETED',
] as const;
const DEFAULT_EVENTS = ['PUSH', 'PR_OPENED', 'PR_MERGED', 'PR_CLOSED', 'ISSUE_OPENED', 'ISSUE_CLOSED'];

const PROVIDER_LABELS: Record<ChannelProvider, string> = {
  dingtalk: '钉钉机器人',
  wecom: '企业微信机器人',
  wechat: '微信机器人',
};
const WECOM_QR_POLL_INTERVAL_MS = 8000;
const WECOM_QR_POLL_TIMEOUT_MS = 180000;

function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { status?: number; data?: { message?: string } } }).response;
    if (response?.status === 401) return '登录已过期，请重新登录';
    if (response?.data?.message) return response.data.message;
  }
  if (error instanceof Error) return error.message;
  return 'Request failed';
}

function isUnauthorizedError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'response' in error &&
    (error as { response?: { status?: number } }).response?.status === 401,
  );
}

function isRateLimitedError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'response' in error &&
    (error as { response?: { status?: number } }).response?.status === 429,
  );
}

function isConnected(status: ImConnectionStatus | null): boolean {
  return Boolean(status?.connected || status?.state === 'connected' || status?.state === 'ready');
}

function normalizeSelectedEvents(events: string[] | undefined): string[] {
  const selected = (events || []).filter((event) =>
    (GITHUB_EVENT_TYPES as readonly string[]).includes(event),
  );
  return selected.length > 0 ? selected : DEFAULT_EVENTS;
}

function createDefaultSubscription(provider: ChannelProvider): ImSubscription {
  return {
    id: `${provider}-default`,
    provider,
    chatName: PROVIDER_LABELS[provider],
    repositoryIds: [],
    branches: [],
    repositoryBranchScopes: {},
    events: DEFAULT_EVENTS,
    enabled: true,
  };
}

function buildFallbackStages(status: ImConnectionStatus | null): ImStageStatus[] {
  if (status?.stages?.length) return status.stages;
  return [
    { id: 'configured', state: status?.state && status.state !== 'not_configured' ? 'verified' : 'missing' },
    { id: 'credential_valid', state: isConnected(status) ? 'verified' : 'unknown' },
    { id: 'ws_connected', state: isConnected(status) ? 'verified' : 'unknown' },
    { id: 'bot_reachable', state: status?.state === 'ready' ? 'verified' : 'unknown' },
    { id: 'subscription_ready', state: 'unknown' },
  ];
}

function formatBranchSummary(branches: string[], fallbackLabel: string) {
  if (branches.length === 0) return fallbackLabel;
  if (branches.length === 1) return branches[0];
  return `${branches[0]} +${branches.length - 1}`;
}

function handleKeyboardClick(event: KeyboardEvent, action: () => void) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  action();
}

function getQrImageSrc(value: string): string | null {
  const content = value.trim();
  if (!content) return null;
  if (content.startsWith('data:image/')) return content;
  if (/^https?:\/\//i.test(content)) return createQrCodeDataUri(content);
  if (content.startsWith('<svg')) {
    return `data:image/svg+xml;utf8,${encodeURIComponent(content)}`;
  }
  return `data:image/png;base64,${content}`;
}

const QR_VERSION = 8;
const QR_SIZE = 21 + (QR_VERSION - 1) * 4;
const QR_DATA_CODEWORDS = 194;
const QR_BLOCK_DATA_CODEWORDS = 97;
const QR_EC_CODEWORDS_PER_BLOCK = 24;
const QR_ALIGNMENT_PATTERN_CENTERS = [6, 24, 42];
const QR_G15 = 0x537;
const QR_G18 = 0x1f25;
const QR_G15_MASK = 0x5412;

const qrGfExp = new Array<number>(512);
const qrGfLog = new Array<number>(256);
let qrGfInitialized = false;

function initQrGaloisField() {
  if (qrGfInitialized) return;
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    qrGfExp[i] = x;
    qrGfLog[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d;
    }
  }
  for (let i = 255; i < 512; i += 1) {
    qrGfExp[i] = qrGfExp[i - 255];
  }
  qrGfInitialized = true;
}

function qrGfMultiply(left: number, right: number) {
  if (left === 0 || right === 0) return 0;
  initQrGaloisField();
  return qrGfExp[qrGfLog[left] + qrGfLog[right]];
}

function buildQrGeneratorPolynomial(degree: number) {
  initQrGaloisField();
  let polynomial = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array<number>(polynomial.length + 1).fill(0);
    for (let j = 0; j < polynomial.length; j += 1) {
      next[j] ^= polynomial[j];
      next[j + 1] ^= qrGfMultiply(polynomial[j], qrGfExp[i]);
    }
    polynomial = next;
  }
  return polynomial;
}

function buildQrErrorCorrectionCodewords(data: number[], degree: number) {
  const generator = buildQrGeneratorPolynomial(degree);
  const result = new Array<number>(degree).fill(0);
  for (const codeword of data) {
    const factor = codeword ^ result.shift()!;
    result.push(0);
    if (factor === 0) continue;
    for (let i = 0; i < degree; i += 1) {
      result[i] ^= qrGfMultiply(generator[i + 1], factor);
    }
  }
  return result;
}

function getQrBchDigit(data: number) {
  let digit = 0;
  while (data !== 0) {
    digit += 1;
    data >>>= 1;
  }
  return digit;
}

function getQrBchTypeInfo(data: number) {
  let d = data << 10;
  while (getQrBchDigit(d) - getQrBchDigit(QR_G15) >= 0) {
    d ^= QR_G15 << (getQrBchDigit(d) - getQrBchDigit(QR_G15));
  }
  return ((data << 10) | d) ^ QR_G15_MASK;
}

function getQrBchTypeNumber(data: number) {
  let d = data << 12;
  while (getQrBchDigit(d) - getQrBchDigit(QR_G18) >= 0) {
    d ^= QR_G18 << (getQrBchDigit(d) - getQrBchDigit(QR_G18));
  }
  return (data << 12) | d;
}

function appendQrBits(bits: boolean[], value: number, length: number) {
  for (let i = length - 1; i >= 0; i -= 1) {
    bits.push(((value >>> i) & 1) === 1);
  }
}

function buildQrDataCodewords(text: string) {
  const bytes = Array.from(new TextEncoder().encode(text));
  if (bytes.length > QR_DATA_CODEWORDS - 2) {
    throw new Error('QR payload is too long');
  }

  const bits: boolean[] = [];
  appendQrBits(bits, 0b0100, 4);
  appendQrBits(bits, bytes.length, 8);
  for (const byte of bytes) {
    appendQrBits(bits, byte, 8);
  }

  const maxBits = QR_DATA_CODEWORDS * 8;
  const terminatorLength = Math.min(4, maxBits - bits.length);
  appendQrBits(bits, 0, terminatorLength);
  while (bits.length % 8 !== 0) {
    bits.push(false);
  }

  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) {
      byte = (byte << 1) | (bits[i + j] ? 1 : 0);
    }
    data.push(byte);
  }

  const pads = [0xec, 0x11];
  let padIndex = 0;
  while (data.length < QR_DATA_CODEWORDS) {
    data.push(pads[padIndex % pads.length]);
    padIndex += 1;
  }
  return data;
}

function createReservedQrMatrix() {
  const modules = Array.from({ length: QR_SIZE }, () => new Array<boolean>(QR_SIZE).fill(false));
  const reserved = Array.from({ length: QR_SIZE }, () => new Array<boolean>(QR_SIZE).fill(false));

  const set = (row: number, col: number, value: boolean, shouldReserve = true) => {
    if (row < 0 || col < 0 || row >= QR_SIZE || col >= QR_SIZE) return;
    modules[row][col] = value;
    if (shouldReserve) reserved[row][col] = true;
  };

  const drawFinder = (top: number, left: number) => {
    for (let row = -1; row <= 7; row += 1) {
      for (let col = -1; col <= 7; col += 1) {
        const targetRow = top + row;
        const targetCol = left + col;
        if (targetRow < 0 || targetCol < 0 || targetRow >= QR_SIZE || targetCol >= QR_SIZE) continue;
        const inPattern = row >= 0 && row <= 6 && col >= 0 && col <= 6;
        const value = inPattern && (row === 0 || row === 6 || col === 0 || col === 6 || (row >= 2 && row <= 4 && col >= 2 && col <= 4));
        set(targetRow, targetCol, value);
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, QR_SIZE - 7);
  drawFinder(QR_SIZE - 7, 0);

  for (let i = 8; i < QR_SIZE - 8; i += 1) {
    const value = i % 2 === 0;
    set(6, i, value);
    set(i, 6, value);
  }

  const drawAlignment = (centerRow: number, centerCol: number) => {
    for (let row = -2; row <= 2; row += 1) {
      for (let col = -2; col <= 2; col += 1) {
        const distance = Math.max(Math.abs(row), Math.abs(col));
        set(centerRow + row, centerCol + col, distance === 2 || distance === 0);
      }
    }
  };

  for (const row of QR_ALIGNMENT_PATTERN_CENTERS) {
    for (const col of QR_ALIGNMENT_PATTERN_CENTERS) {
      const overlapsFinder =
        (row === 6 && col === 6) ||
        (row === 6 && col === QR_ALIGNMENT_PATTERN_CENTERS[QR_ALIGNMENT_PATTERN_CENTERS.length - 1]) ||
        (row === QR_ALIGNMENT_PATTERN_CENTERS[QR_ALIGNMENT_PATTERN_CENTERS.length - 1] && col === 6);
      if (!overlapsFinder) drawAlignment(row, col);
    }
  }

  for (let i = 0; i < 15; i += 1) {
    if (i < 6) {
      reserved[i][8] = true;
    } else if (i < 8) {
      reserved[i + 1][8] = true;
    } else {
      reserved[QR_SIZE - 15 + i][8] = true;
    }

    if (i < 8) {
      reserved[8][QR_SIZE - i - 1] = true;
    } else if (i < 9) {
      reserved[8][15 - i] = true;
    } else {
      reserved[8][15 - i - 1] = true;
    }
  }

  for (let i = 0; i < 18; i += 1) {
    reserved[Math.floor(i / 3)][(i % 3) + QR_SIZE - 11] = true;
    reserved[(i % 3) + QR_SIZE - 11][Math.floor(i / 3)] = true;
  }

  set(QR_SIZE - 8, 8, true);

  return { modules, reserved };
}

function applyQrFormatAndVersionInfo(modules: boolean[][]) {
  const formatBits = getQrBchTypeInfo(0b001000);
  for (let i = 0; i < 15; i += 1) {
    const value = ((formatBits >>> i) & 1) === 1;
    if (i < 6) modules[i][8] = value;
    else if (i < 8) modules[i + 1][8] = value;
    else modules[QR_SIZE - 15 + i][8] = value;

    if (i < 8) modules[8][QR_SIZE - i - 1] = value;
    else if (i < 9) modules[8][15 - i] = value;
    else modules[8][15 - i - 1] = value;
  }

  modules[QR_SIZE - 8][8] = true;

  const versionBits = getQrBchTypeNumber(QR_VERSION);
  for (let i = 0; i < 18; i += 1) {
    const value = ((versionBits >>> i) & 1) === 1;
    modules[Math.floor(i / 3)][(i % 3) + QR_SIZE - 11] = value;
    modules[(i % 3) + QR_SIZE - 11][Math.floor(i / 3)] = value;
  }
}

function createQrCodeSvg(text: string) {
  const dataCodewords = buildQrDataCodewords(text);
  const blocks = [
    dataCodewords.slice(0, QR_BLOCK_DATA_CODEWORDS),
    dataCodewords.slice(QR_BLOCK_DATA_CODEWORDS, QR_BLOCK_DATA_CODEWORDS * 2),
  ];
  const errorBlocks = blocks.map((block) => buildQrErrorCorrectionCodewords(block, QR_EC_CODEWORDS_PER_BLOCK));
  const codewords: number[] = [];

  for (let i = 0; i < QR_BLOCK_DATA_CODEWORDS; i += 1) {
    for (const block of blocks) codewords.push(block[i]);
  }
  for (let i = 0; i < QR_EC_CODEWORDS_PER_BLOCK; i += 1) {
    for (const block of errorBlocks) codewords.push(block[i]);
  }

  const { modules, reserved } = createReservedQrMatrix();
  const bits = codewords.flatMap((codeword) =>
    Array.from({ length: 8 }, (_, index) => ((codeword >>> (7 - index)) & 1) === 1),
  );

  let bitIndex = 0;
  let direction = -1;
  for (let col = QR_SIZE - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1;
    for (let rowOffset = 0; rowOffset < QR_SIZE; rowOffset += 1) {
      const row = direction === -1 ? QR_SIZE - 1 - rowOffset : rowOffset;
      for (let colOffset = 0; colOffset < 2; colOffset += 1) {
        const currentCol = col - colOffset;
        if (reserved[row][currentCol]) continue;
        const mask = (row + currentCol) % 2 === 0;
        modules[row][currentCol] = (bits[bitIndex] ?? false) !== mask;
        bitIndex += 1;
      }
    }
    direction *= -1;
  }

  applyQrFormatAndVersionInfo(modules);

  const quietZone = 4;
  const viewBoxSize = QR_SIZE + quietZone * 2;
  const darkCells: string[] = [];
  for (let row = 0; row < QR_SIZE; row += 1) {
    for (let col = 0; col < QR_SIZE; col += 1) {
      if (modules[row][col]) {
        darkCells.push(`<rect x="${col + quietZone}" y="${row + quietZone}" width="1" height="1"/>`);
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${darkCells.join('')}</g></svg>`;
}

function createQrCodeDataUri(text: string) {
  try {
    return `data:image/svg+xml;utf8,${encodeURIComponent(createQrCodeSvg(text))}`;
  } catch {
    return null;
  }
}

function getGuideSteps(provider: ChannelProvider): string[] {
  if (provider === 'dingtalk') {
    return [
      '在钉钉开放平台创建企业内部应用。',
      '开启机器人能力，并发布应用版本。',
      '事件订阅选择 Stream 模式。',
      '保存凭证并测试连接后，把机器人加入群聊。',
      '在群里发送 /bind 配对码。',
    ];
  }
  if (provider === 'wecom') {
    return [
      '优先使用扫码授权获取 Bot ID 和 Secret。',
      '扫码不可用时可手动填写凭证。',
      '保存后测试 Bot WebSocket 长连接。',
      '把机器人加入会话后，在会话里发送 /bind 配对码。',
      '绑定完成后按订阅规则接收 GitHub 事件推送。',
    ];
  }
  return [
    '点击扫码登录，使用微信确认登录。',
    '保持 Repo-Pulse API 进程运行以接收长轮询消息。',
    '登录成功后发送 /bind 配对码完成绑定。',
    '个人微信第一版使用文本推送。',
  ];
}

function RepositorySubscriptionItem({
  repo,
  checked,
  expanded,
  branchSummary,
  selectedBranches,
  onToggleRepository,
  onToggleExpanded,
  onToggleBranch,
  onResetBranches,
  t,
}: {
  repo: Repository;
  checked: boolean;
  expanded: boolean;
  branchSummary: string;
  selectedBranches: string[];
  onToggleRepository: (repositoryId: string) => void;
  onToggleExpanded: (repositoryId: string) => void;
  onToggleBranch: (repositoryId: string, branchName: string) => void;
  onResetBranches: (repositoryId: string) => void;
  t: (key: string) => string;
}) {
  const branchesQuery = useRepositoryBranchesQuery(repo.id, expanded);
  const branchOptions = (branchesQuery.data ?? [])
    .map((branch) => normalizeBranchOption(branch))
    .filter((branch): branch is RepositoryBranchScopeOption => Boolean(branch));

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--github-border)]/80 bg-white/[0.02]">
      <div className="flex items-center gap-3 px-3 py-2">
        <div
          role="button"
          tabIndex={0}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          onClick={() => onToggleRepository(repo.id)}
          onKeyDown={(event) => handleKeyboardClick(event, () => onToggleRepository(repo.id))}
        >
          <Checkbox checked={checked} className="pointer-events-none border-[var(--github-border)]" />
          <GitBranch className="h-4 w-4 shrink-0 text-[var(--github-text-secondary)]" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{repo.fullName}</p>
            <p className="truncate text-xs text-[var(--github-text-secondary)]">
              {checked ? branchSummary : '未订阅'}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg text-[var(--github-text-secondary)] hover:bg-white/5 hover:text-white"
          onClick={() => onToggleExpanded(repo.id)}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      </div>

      {expanded ? (
        <div className="space-y-3 border-t border-[var(--github-border)]/80 bg-black/10 px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--github-text-secondary)]">
              {t('dashboard.scope.branches.title')}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 rounded-lg px-2 text-xs text-[var(--github-accent)] hover:bg-[var(--github-accent)]/10 hover:text-white"
              onClick={() => onResetBranches(repo.id)}
            >
              {t('dashboard.scope.row.allBranches')}
            </Button>
          </div>

          {branchesQuery.isLoading ? (
            <div className="flex items-center gap-2 rounded-lg border border-[var(--github-border)]/70 bg-white/[0.03] px-3 py-3 text-sm text-[var(--github-text-secondary)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('dashboard.scope.branches.loading')}
            </div>
          ) : branchOptions.length === 0 ? (
            <div className="rounded-lg border border-[var(--github-border)]/70 bg-white/[0.03] px-3 py-3 text-sm text-[var(--github-text-secondary)]">
              {t('dashboard.scope.branches.empty')}
            </div>
          ) : (
            <div className="grid gap-2">
              {branchOptions.map((branch) => (
                <div
                  key={`${repo.id}-${branch.name}`}
                  role="button"
                  tabIndex={0}
                  className="flex items-center gap-3 rounded-lg border border-[var(--github-border)]/70 bg-white/[0.02] px-3 py-2 text-left transition-colors hover:border-[var(--github-accent)]/40 hover:bg-white/[0.05]"
                  onClick={() => onToggleBranch(repo.id, branch.name)}
                  onKeyDown={(event) => handleKeyboardClick(event, () => onToggleBranch(repo.id, branch.name))}
                >
                  <Checkbox checked={selectedBranches.includes(branch.name)} className="pointer-events-none border-[var(--github-border)]" />
                  <span className="min-w-0 flex-1 truncate text-sm text-white">{branch.name}</span>
                  {branch.isDefault ? (
                    <span className="rounded-full bg-[var(--github-accent)]/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--github-accent)]">
                      default
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function ImChannelIntegrationDialog({
  provider,
  open,
  onOpenChange,
  onConnectionChange,
}: ImChannelIntegrationDialogProps) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('credentials');
  const [status, setStatus] = useState<ImConnectionStatus | null>(null);
  const [testResult, setTestResult] = useState<FeishuConnectionTestResult | null>(null);
  const [pairingCode, setPairingCode] = useState<PairingCodeResult | null>(null);
  const [subscriptions, setSubscriptions] = useState<ImSubscription[]>([]);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [repositorySearch, setRepositorySearch] = useState('');
  const [repositoryListMode, setRepositoryListMode] = useState<'monitored' | 'all'>('monitored');
  const [expandedRepositoryIds, setExpandedRepositoryIds] = useState<string[]>([]);
  const [guideOpen, setGuideOpen] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [loadingRepositories, setLoadingRepositories] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [savingSubscriptions, setSavingSubscriptions] = useState(false);
  const [sendingTestNotification, setSendingTestNotification] = useState(false);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [botId, setBotId] = useState('');
  const [botSecret, setBotSecret] = useState('');
  const [wechatToken, setWechatToken] = useState('');
  const [wechatBotId, setWechatBotId] = useState('');
  const [wechatUserId, setWechatUserId] = useState('');
  const [wechatBaseUrl, setWechatBaseUrl] = useState('');
  const [qrUrl, setQrUrl] = useState('');
  const [qrImageFailed, setQrImageFailed] = useState(false);
  const [wecomScode, setWecomScode] = useState('');
  const [wecomQrPollStatus, setWecomQrPollStatus] = useState('');
  const wecomPollStartedAtRef = useRef<number | null>(null);
  const wecomPollInFlightRef = useRef(false);

  const label = PROVIDER_LABELS[provider];
  const qrImageSrc = qrImageFailed ? null : getQrImageSrc(qrUrl);
  const stages = useMemo(() => buildFallbackStages(status), [status]);
  const connected = isConnected(status);
  const currentSubscription = subscriptions[0] ?? createDefaultSubscription(provider);
  const selectedEvents = normalizeSelectedEvents(currentSubscription.events);
  const selectedRepositoryIds = useMemo(
    () => currentSubscription.repositoryIds ?? [],
    [currentSubscription.repositoryIds],
  );
  const allRepositoriesSelected = selectedRepositoryIds.length === 0;
  const availableRepositoryIdSet = useMemo(() => new Set(repositories.map((repository) => repository.id)), [repositories]);
  const normalizedRepositoryBranchScopes: RepositoryBranchScopeMap = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(currentSubscription.repositoryBranchScopes ?? {})
          .filter(([repositoryId]) => availableRepositoryIdSet.has(repositoryId))
          .map(([repositoryId, branches]) => [
            repositoryId,
            Array.from(new Set(branches)).sort((left, right) => left.localeCompare(right)),
          ]),
      ),
    [availableRepositoryIdSet, currentSubscription.repositoryBranchScopes],
  );
  const visibleRepositories = useMemo(() => (
    repositoryListMode === 'monitored'
      ? repositories.filter((repository) =>
          allRepositoriesSelected ? repository.isActive : selectedRepositoryIds.includes(repository.id),
        )
      : repositories
  ), [allRepositoriesSelected, repositories, repositoryListMode, selectedRepositoryIds]);
  const filteredRepositories = useMemo(() => {
    const keyword = repositorySearch.trim().toLowerCase();
    if (!keyword) return visibleRepositories;
    return visibleRepositories.filter((repository) =>
      repository.fullName.toLowerCase().includes(keyword) ||
      repository.name.toLowerCase().includes(keyword),
    );
  }, [repositorySearch, visibleRepositories]);

  const refreshStatus = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoadingStatus(true);
    try {
      const nextStatus = await imService.getImStatus();
      const providerStatus = nextStatus[provider] ?? null;
      setStatus(providerStatus);
      if (provider === 'dingtalk') {
        setClientId(providerStatus?.clientId ?? '');
      } else if (provider === 'wecom') {
        setBotId(providerStatus?.botId ?? '');
      } else if (provider === 'wechat') {
        setWechatBotId(providerStatus?.ilinkBotId ?? '');
        setQrUrl(providerStatus?.qrCodeUrl ?? '');
      }
      onConnectionChange?.(provider, isConnected(providerStatus));

      void imService.listSubscriptions(provider)
        .then((nextSubscriptions) => {
          setSubscriptions(nextSubscriptions.length > 0 ? nextSubscriptions : [createDefaultSubscription(provider)]);
        })
        .catch((subscriptionError) => {
          if (!isUnauthorizedError(subscriptionError)) {
            toast.error(getErrorMessage(subscriptionError));
          }
          setSubscriptions([createDefaultSubscription(provider)]);
        });

      return providerStatus;
    } catch (error) {
      toast.error(getErrorMessage(error));
      if (isUnauthorizedError(error)) {
        onOpenChange(false);
      }
      setStatus(null);
      onConnectionChange?.(provider, false);
      return null;
    } finally {
      if (!options?.silent) setLoadingStatus(false);
    }
  }, [onConnectionChange, onOpenChange, provider]);

  const loadRepositories = useCallback(async () => {
    setLoadingRepositories(true);
    try {
      setRepositories(await repositoryService.getAll());
    } catch (error) {
      toast.error(getErrorMessage(error));
      setRepositories([]);
    } finally {
      setLoadingRepositories(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    void (async () => {
      const nextStatus = await refreshStatus();
      if (!cancelled && nextStatus) {
        await loadRepositories();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [loadRepositories, open, refreshStatus]);

  useEffect(() => {
    if (!open) return;
    if (provider !== 'wecom' || !wecomScode) return;
    if (connected) {
      setWecomScode('');
      setWecomQrPollStatus('');
      wecomPollStartedAtRef.current = null;
      return;
    }

    let cancelled = false;
    if (!wecomPollStartedAtRef.current) {
      wecomPollStartedAtRef.current = Date.now();
    }

    const poll = async () => {
      if (wecomPollInFlightRef.current) return;
      const startedAt = wecomPollStartedAtRef.current ?? Date.now();
      if (Date.now() - startedAt > WECOM_QR_POLL_TIMEOUT_MS) {
        setWecomQrPollStatus('已超时，请重新生成二维码');
        setWecomScode('');
        wecomPollStartedAtRef.current = null;
        return;
      }

      wecomPollInFlightRef.current = true;
      try {
        const result = await imService.checkWecomQrCode(wecomScode);
        if (cancelled) return;

        if (result.status === 'success') {
          toast.success('企业微信授权成功');
          setWecomScode('');
          setWecomQrPollStatus('');
          wecomPollStartedAtRef.current = null;
          setBotId(result.botId ?? '');
          if (result.secret) setBotSecret(result.secret);
          if (result.connection) {
            setStatus(result.connection);
            onConnectionChange?.(provider, isConnected(result.connection));
          }
          setActiveTab('test');
          void refreshStatus({ silent: true });
        } else if (result.status === 'error') {
          toast.error(result.error || '企业微信授权失败');
          setWecomScode('');
          wecomPollStartedAtRef.current = null;
        } else if (result.pollStatus) {
          setWecomQrPollStatus(result.pollStatus);
        } else {
          setWecomQrPollStatus('等待确认');
        }
      } catch (error) {
        if (!cancelled) {
          if (isRateLimitedError(error)) {
            toast.error('企业微信授权查询过于频繁，已暂停轮询。请稍后重新生成二维码。');
            setWecomScode('');
            wecomPollStartedAtRef.current = null;
          } else {
            toast.error(getErrorMessage(error));
          }
        }
      } finally {
        wecomPollInFlightRef.current = false;
      }
    };

    void poll();
    const interval = window.setInterval(() => {
      void poll();
    }, WECOM_QR_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      wecomPollInFlightRef.current = false;
    };
  }, [connected, onConnectionChange, open, provider, refreshStatus, wecomScode]);

  useEffect(() => {
    if (!open || provider !== 'wechat' || !qrUrl || connected) return;
    const interval = window.setInterval(() => {
      void refreshStatus({ silent: true });
    }, 3000);
    return () => window.clearInterval(interval);
  }, [connected, open, provider, qrUrl, refreshStatus]);

  const canSubmitCredentials =
    provider === 'dingtalk'
      ? clientId.trim().length > 0 && clientSecret.trim().length > 0
      : provider === 'wecom'
        ? botId.trim().length > 0 && botSecret.trim().length > 0
        : wechatToken.trim().length > 0 && wechatBotId.trim().length > 0 && wechatUserId.trim().length > 0;

  const saveCredentials = async () => {
    if (!canSubmitCredentials) {
      toast.error('请补齐凭证');
      return;
    }
    setSaving(true);
    try {
      const nextStatus = provider === 'dingtalk'
        ? await imService.saveDingTalkConnection({ clientId: clientId.trim(), clientSecret: clientSecret.trim() })
        : provider === 'wecom'
          ? await imService.saveWecomConnection({ botId: botId.trim(), secret: botSecret.trim() })
          : await imService.saveWechatConnection({
              botToken: wechatToken.trim(),
              ilinkBotId: wechatBotId.trim(),
              ilinkUserId: wechatUserId.trim(),
              baseUrl: wechatBaseUrl.trim() || undefined,
            });
      setStatus(nextStatus);
      onConnectionChange?.(provider, isConnected(nextStatus));
      toast.success('凭证已保存');
      setActiveTab('test');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      if (provider === 'dingtalk') {
        const result = await imService.testDingTalkConnection({ clientId: clientId.trim(), clientSecret: clientSecret.trim() });
        setTestResult(result);
        toast[result.success ? 'success' : 'error'](result.message);
        void refreshStatus({ silent: true });
      } else if (provider === 'wechat') {
        const nextStatus = await imService.startWechat();
        setStatus(nextStatus);
        toast[isConnected(nextStatus) ? 'success' : 'error'](nextStatus.summary || '微信状态已更新');
      } else {
        const nextStatus = await imService.startWecom();
        setStatus(nextStatus);
        toast[isConnected(nextStatus) ? 'success' : 'error'](nextStatus.summary || '企业微信状态已更新');
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setTesting(false);
    }
  };

  const startQrFlow = async () => {
    setTesting(true);
    try {
      if (provider === 'wecom') {
        const result = await imService.generateWecomQrCode();
        if (!result.ok || !result.authUrl || !result.scode) {
          toast.error(result.error || '企业微信二维码生成失败');
          return;
        }
        setQrImageFailed(false);
        setWecomQrPollStatus('waiting');
        wecomPollStartedAtRef.current = Date.now();
        wecomPollInFlightRef.current = false;
        setQrUrl(result.authUrl);
        setWecomScode(result.scode);
        toast.success('授权链接已生成');
      } else if (provider === 'wechat') {
        const nextStatus = await imService.startWechatLogin();
        setStatus(nextStatus);
        setQrImageFailed(false);
        setQrUrl(nextStatus.qrCodeUrl || '');
        toast.success('微信登录已启动');
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setTesting(false);
    }
  };

  const createPairingCode = async () => {
    setPairing(true);
    try {
      const result = await imService.createPairingCode(provider);
      setPairingCode(result);
      setActiveTab('binding');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setPairing(false);
    }
  };

  const sendTestNotification = async () => {
    setSendingTestNotification(true);
    try {
      const result = await imService.sendProviderTestNotification(provider);
      toast[result.sent > 0 ? 'success' : 'error'](result.message);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSendingTestNotification(false);
    }
  };

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success('已复制');
  };

  const saveSubscriptions = async () => {
    setSavingSubscriptions(true);
    try {
      const nextSubscriptions = await imService.saveSubscriptions({
        subscriptions: [{
          ...currentSubscription,
          provider,
          branches: [],
          repositoryBranchScopes: normalizedRepositoryBranchScopes,
          events: normalizeSelectedEvents(currentSubscription.events),
        }],
      }, provider);
      setSubscriptions(nextSubscriptions);
      toast.success('订阅已保存');
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setSavingSubscriptions(false);
    }
  };

  const updateSubscription = (subscription: ImSubscription) => setSubscriptions([{ ...subscription, provider }]);
  const toggleEvent = (eventName: string) => {
    const events = selectedEvents.includes(eventName)
      ? selectedEvents.filter((event) => event !== eventName)
      : [...selectedEvents, eventName];
    updateSubscription({ ...currentSubscription, events });
  };
  const selectAllRepositories = () => updateSubscription({ ...currentSubscription, repositoryIds: [], branches: [], repositoryBranchScopes: {} });
  const toggleRepository = (repositoryId: string) => {
    const currentRepositoryIds = allRepositoriesSelected ? [] : currentSubscription.repositoryIds || [];
    const nextRepositoryIds = currentRepositoryIds.includes(repositoryId)
      ? currentRepositoryIds.filter((id) => id !== repositoryId)
      : [...currentRepositoryIds, repositoryId];
    const nextScopes = { ...normalizedRepositoryBranchScopes };
    if (currentRepositoryIds.includes(repositoryId)) delete nextScopes[repositoryId];
    updateSubscription({ ...currentSubscription, repositoryIds: nextRepositoryIds, branches: [], repositoryBranchScopes: nextScopes });
  };
  const toggleExpandedRepository = (repositoryId: string) => {
    setExpandedRepositoryIds((current) =>
      current.includes(repositoryId) ? current.filter((id) => id !== repositoryId) : [...current, repositoryId],
    );
  };
  const toggleRepositoryBranch = (repositoryId: string, branchName: string) => {
    const repositoryIds = allRepositoriesSelected
      ? [repositoryId]
      : selectedRepositoryIds.includes(repositoryId)
        ? selectedRepositoryIds
        : [...selectedRepositoryIds, repositoryId];
    const currentBranches = normalizedRepositoryBranchScopes[repositoryId] ?? [];
    const nextBranches = currentBranches.includes(branchName)
      ? currentBranches.filter((branch) => branch !== branchName)
      : [...currentBranches, branchName].sort((left, right) => left.localeCompare(right));
    updateSubscription({
      ...currentSubscription,
      repositoryIds,
      branches: [],
      repositoryBranchScopes: { ...normalizedRepositoryBranchScopes, [repositoryId]: nextBranches },
    });
  };
  const resetRepositoryBranches = (repositoryId: string) => {
    if (allRepositoriesSelected || !selectedRepositoryIds.includes(repositoryId)) return;
    updateSubscription({
      ...currentSubscription,
      branches: [],
      repositoryBranchScopes: { ...normalizedRepositoryBranchScopes, [repositoryId]: [] },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] flex-col overflow-hidden border-[var(--github-border)] bg-[#0d1117] text-white sm:max-h-[min(760px,calc(100dvh-3rem))] sm:max-w-2xl">
        <DialogHeader className="shrink-0">
          <div className="flex items-center gap-3">
            <DialogTitle>{label}</DialogTitle>
            {connected ? <Badge className="bg-green-400/20 text-green-400">{t('settings.integrations.connected')}</Badge> : null}
          </div>
          <DialogDescription className="text-[var(--github-text-secondary)]">
            {status?.summary || testResult?.message || '配置机器人，然后完成绑定和订阅。'}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col gap-4">
            <TabsList className="grid w-full shrink-0 grid-cols-4 border border-[var(--github-border)] bg-[var(--github-surface)]">
              <TabsTrigger value="credentials">凭证</TabsTrigger>
              <TabsTrigger value="test">测试</TabsTrigger>
              <TabsTrigger value="binding">绑定</TabsTrigger>
              <TabsTrigger value="subscriptions">订阅</TabsTrigger>
            </TabsList>

            <TabsContent value="credentials" className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
              {loadingStatus ? (
                <div className="flex items-center gap-2 rounded-lg border border-[var(--github-border)] bg-white/5 px-3 py-2 text-xs text-[var(--github-text-secondary)]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--github-accent)]" />
                  正在同步状态
                </div>
              ) : null}

              {provider === 'dingtalk' ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Client ID</Label>
                    <Input value={clientId} onChange={(event) => setClientId(event.target.value)} className="border-[var(--github-border)] bg-[var(--github-surface)]" placeholder="dingxxxxxxxx" />
                  </div>
                  <div className="space-y-2">
                    <Label>Client Secret</Label>
                    <Input type="password" value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} className="border-[var(--github-border)] bg-[var(--github-surface)]" placeholder="••••••••" />
                  </div>
                </div>
              ) : provider === 'wecom' ? (
                <div className="space-y-4">
                  <Button type="button" variant="outline" className="gap-2 border-[var(--github-border)]" onClick={startQrFlow} disabled={testing}>
                    {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    扫码授权
                  </Button>
                  {qrUrl ? (
                    <div className="rounded-lg border border-[var(--github-border)] bg-white/5 p-3 text-xs text-[var(--github-text-secondary)]">
                      {qrImageSrc ? (
                        <div className="mb-3 flex justify-center rounded-lg bg-white p-3">
                          <img
                            src={qrImageSrc}
                            alt="企业微信授权二维码"
                            className="h-44 w-44 object-contain"
                            onError={() => setQrImageFailed(true)}
                          />
                        </div>
                      ) : null}
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="truncate">{qrImageSrc ? '二维码已生成' : qrUrl}</span>
                        <Button size="sm" variant="outline" className="h-7 border-[var(--github-border)]" onClick={() => copyText(qrUrl)}>
                          {qrImageSrc ? '复制链接' : '复制'}
                        </Button>
                      </div>
                      <a href={qrUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[var(--github-accent)]">
                        {qrImageSrc ? '打开授权页' : '打开授权链接'} <ExternalLink className="h-3 w-3" />
                      </a>
                      {wecomScode ? (
                        <p className="mt-2 text-[11px] text-[var(--github-text-secondary)]">
                          正在等待授权结果{wecomQrPollStatus ? `：${wecomQrPollStatus}` : ''}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Bot ID</Label>
                      <Input value={botId} onChange={(event) => setBotId(event.target.value)} className="border-[var(--github-border)] bg-[var(--github-surface)]" />
                    </div>
                    <div className="space-y-2">
                      <Label>Secret</Label>
                      <Input type="password" value={botSecret} onChange={(event) => setBotSecret(event.target.value)} className="border-[var(--github-border)] bg-[var(--github-surface)]" placeholder="••••••••" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <Button type="button" variant="outline" className="gap-2 border-[var(--github-border)]" onClick={startQrFlow} disabled={testing}>
                    {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    扫码登录
                  </Button>
                  {qrUrl ? (
                    <div className="rounded-lg border border-[var(--github-border)] bg-white/5 p-3 text-xs text-[var(--github-text-secondary)]">
                      {qrImageSrc ? (
                        <div className="mb-3 flex justify-center rounded-lg bg-white p-3">
                          <img
                            src={qrImageSrc}
                            alt="微信登录二维码"
                            className="h-44 w-44 object-contain"
                            onError={() => setQrImageFailed(true)}
                          />
                        </div>
                      ) : null}
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="truncate">{qrImageSrc ? '二维码已生成' : qrUrl}</span>
                        <Button size="sm" variant="outline" className="h-7 border-[var(--github-border)]" onClick={() => copyText(qrUrl)}>
                          {qrImageSrc ? '复制数据' : '复制'}
                        </Button>
                      </div>
                      <span>{qrImageSrc ? '使用微信扫描二维码并在手机上确认。' : '二维码图片加载失败，请打开链接并在手机上确认。'}</span>
                    </div>
                  ) : null}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Bot Token</Label>
                      <Input type="password" value={wechatToken} onChange={(event) => setWechatToken(event.target.value)} className="border-[var(--github-border)] bg-[var(--github-surface)]" />
                    </div>
                    <div className="space-y-2">
                      <Label>iLink Bot ID</Label>
                      <Input value={wechatBotId} onChange={(event) => setWechatBotId(event.target.value)} className="border-[var(--github-border)] bg-[var(--github-surface)]" />
                    </div>
                    <div className="space-y-2">
                      <Label>iLink User ID</Label>
                      <Input value={wechatUserId} onChange={(event) => setWechatUserId(event.target.value)} className="border-[var(--github-border)] bg-[var(--github-surface)]" />
                    </div>
                    <div className="space-y-2">
                      <Label>Base URL</Label>
                      <Input value={wechatBaseUrl} onChange={(event) => setWechatBaseUrl(event.target.value)} className="border-[var(--github-border)] bg-[var(--github-surface)]" placeholder="https://ilinkai.weixin.qq.com" />
                    </div>
                  </div>
                </div>
              )}

              <Collapsible open={guideOpen} onOpenChange={setGuideOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 px-0 text-[var(--github-accent)] hover:bg-transparent">
                    查看指引
                    <ChevronDown className="ml-1 h-4 w-4" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="rounded-lg border border-[var(--github-border)] bg-white/5 p-3 text-xs leading-6 text-[var(--github-text-secondary)]">
                    {getGuideSteps(provider).map((step, index) => (
                      <p key={step}>{index + 1}. {step}</p>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </TabsContent>

            <TabsContent value="test" className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
              <div className="grid gap-3 sm:grid-cols-5">
                {stages.map((stage) => (
                  <div key={stage.id} className="rounded-lg border border-[var(--github-border)] bg-white/5 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-medium text-white">
                        {t(`settings.integrations.feishu.stage.${stage.id}`)}
                      </p>
                      {stage.state === 'verified' ? (
                        <CheckCircle className="h-4 w-4 shrink-0 text-green-400" />
                      ) : stage.state === 'error' || stage.state === 'missing' ? (
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                      ) : (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--github-text-secondary)]" />
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--github-text-secondary)]">
                      {stage.message || t(`settings.integrations.feishu.stageState.${stage.state}`)}
                    </p>
                  </div>
                ))}
              </div>
              {(status?.nextStep || testResult?.nextStep) ? (
                <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-100">
                  {testResult?.nextStep || status?.nextStep}
                </div>
              ) : null}
            </TabsContent>

            <TabsContent value="binding" className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
              <div className="rounded-lg border border-[var(--github-border)] bg-white/5 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">
                      {pairingCode?.code ? `/bind ${pairingCode.code}` : '暂无配对码'}
                    </p>
                    <p className="mt-1 text-xs text-[var(--github-text-secondary)]">
                      {pairingCode?.expiresAt
                        ? `${new Date(pairingCode.expiresAt).toLocaleTimeString()} 过期`
                        : `生成配对码后，在${label}会话里发送给机器人。`}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-[var(--github-border)]"
                    disabled={!pairingCode?.code}
                    onClick={() => pairingCode?.code && copyText(`/bind ${pairingCode.code}`)}
                  >
                    <Clipboard className="mr-2 h-4 w-4" />
                    复制
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="subscriptions" className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
              <div className="flex items-center justify-between rounded-lg border border-[var(--github-border)] bg-white/5 p-3">
                <p className="text-sm text-white">启用推送</p>
                <Switch checked={currentSubscription.enabled ?? true} onCheckedChange={(enabled) => updateSubscription({ ...currentSubscription, enabled })} />
              </div>

              <div className="space-y-2">
                <Label>仓库</Label>
                <div className="overflow-hidden rounded-lg border border-[var(--github-border)] bg-white/[0.02]">
                  <div
                    role="button"
                    tabIndex={0}
                    className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left hover:bg-white/5"
                    onClick={selectAllRepositories}
                    onKeyDown={(event) => handleKeyboardClick(event, selectAllRepositories)}
                  >
                    <Checkbox checked={allRepositoriesSelected} className="pointer-events-none border-[var(--github-border)]" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">全部已监控仓库</p>
                      <p className="mt-1 truncate text-xs text-[var(--github-text-secondary)]">未指定仓库时推送所有启用仓库。</p>
                    </div>
                  </div>
                  <Separator className="bg-[var(--github-border)]" />
                  <div className="p-2">
                    <div className="mb-2 grid grid-cols-2 rounded-md border border-[var(--github-border)] bg-[var(--github-surface)] p-1">
                      {(['monitored', 'all'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          className={`h-8 rounded px-2 text-xs font-medium transition-colors ${
                            repositoryListMode === mode
                              ? 'bg-[var(--github-accent)] text-white'
                              : 'text-[var(--github-text-secondary)] hover:bg-white/5 hover:text-white'
                          }`}
                          onClick={() => setRepositoryListMode(mode)}
                        >
                          {mode === 'monitored' ? '已监控' : '全部'}
                        </button>
                      ))}
                    </div>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--github-text-secondary)]" />
                      <Input
                        value={repositorySearch}
                        onChange={(event) => setRepositorySearch(event.target.value)}
                        className="h-9 border-[var(--github-border)] bg-[var(--github-surface)] pl-9 text-sm"
                        placeholder="搜索仓库"
                      />
                    </div>
                  </div>
                  <div className="max-h-80 overflow-y-auto px-2 pb-2">
                    {loadingRepositories ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 className="h-4 w-4 animate-spin text-[var(--github-accent)]" />
                      </div>
                    ) : filteredRepositories.length === 0 ? (
                      <div className="px-2 py-4 text-xs text-[var(--github-text-secondary)]">暂无匹配仓库</div>
                    ) : (
                      <div className="space-y-2">
                        {filteredRepositories.map((repository) => {
                          const selectedBranches = normalizedRepositoryBranchScopes[repository.id] ?? [];
                          return (
                            <RepositorySubscriptionItem
                              key={repository.id}
                              repo={repository}
                              checked={selectedRepositoryIds.includes(repository.id)}
                              expanded={expandedRepositoryIds.includes(repository.id)}
                              branchSummary={formatBranchSummary(selectedBranches, t('dashboard.scope.row.allBranches'))}
                              selectedBranches={selectedBranches}
                              onToggleRepository={toggleRepository}
                              onToggleExpanded={toggleExpandedRepository}
                              onToggleBranch={toggleRepositoryBranch}
                              onResetBranches={resetRepositoryBranches}
                              t={t}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {GITHUB_EVENT_TYPES.map((eventName) => (
                  <div key={eventName} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-[var(--github-border)] bg-white/5 p-3">
                    <p className="truncate text-sm text-white">
                      {t(`settings.integrations.feishu.event.${eventName}`)}
                    </p>
                    <Switch checked={selectedEvents.includes(eventName)} onCheckedChange={() => toggleEvent(eventName)} />
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>

        <Separator className="shrink-0 bg-[var(--github-border)]" />
        <DialogFooter className="shrink-0 gap-2">
          {activeTab === 'credentials' ? (
            <Button onClick={saveCredentials} disabled={saving || !canSubmitCredentials} className="btn-x-primary gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存
            </Button>
          ) : null}
          {activeTab === 'test' ? (
            <>
              <Button variant="outline" onClick={sendTestNotification} disabled={sendingTestNotification} className="gap-2 border-[var(--github-border)]">
                {sendingTestNotification ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                测试推送
              </Button>
              <Button onClick={testConnection} disabled={testing} className="btn-x-primary gap-2">
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                测试连接
              </Button>
            </>
          ) : null}
          {activeTab === 'binding' ? (
            <Button onClick={createPairingCode} disabled={pairing} className="btn-x-primary gap-2">
              {pairing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              生成配对码
            </Button>
          ) : null}
          {activeTab === 'subscriptions' ? (
            <Button onClick={saveSubscriptions} disabled={savingSubscriptions} className="btn-x-primary gap-2">
              {savingSubscriptions ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存订阅
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
