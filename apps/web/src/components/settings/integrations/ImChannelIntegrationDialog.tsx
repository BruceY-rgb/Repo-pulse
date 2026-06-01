import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Clipboard,
  ExternalLink,
  GitBranch,
  Loader2,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Plus,
  Bot,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
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

function createDefaultSubscription(provider: ChannelProvider, robotId?: string): ImSubscription {
  return {
    id: robotId ? `${provider}-${robotId}-default` : `${provider}-default`,
    provider,
    robotId,
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

  // 二级管理状态
  const [selectedBot, setSelectedBot] = useState<ImConnectionStatus | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [botName, setBotName] = useState('');

  const selectedBotRef = useRef<ImConnectionStatus | null>(null);
  selectedBotRef.current = selectedBot;

  const resetBotState = useCallback(() => {
    setSelectedBot(null);
    setBotName('');
    setTestResult(null);
    setPairingCode(null);
    setClientId('');
    setClientSecret('');
    setBotId('');
    setBotSecret('');
    setWechatToken('');
    setWechatBotId('');
    setWechatUserId('');
    setWechatBaseUrl('');
    setQrUrl('');
    setQrImageFailed(false);
    setWecomScode('');
    setWecomQrPollStatus('');
    setSubscriptions([]);
    setIsAdding(false);
    setActiveTab('credentials');
    wecomPollStartedAtRef.current = null;
    wecomPollInFlightRef.current = false;
  }, []);

  const label = PROVIDER_LABELS[provider];
  const qrImageSrc = qrImageFailed ? null : getQrImageSrc(qrUrl);
  const stages = useMemo(() => buildFallbackStages(selectedBot), [selectedBot]);
  const connected = isConnected(selectedBot);
  
  const bots = useMemo(() => status?.bots || [], [status]);

  const loadSubscriptionsForBot = useCallback(async (robotId: string) => {
    try {
      const nextSubscriptions = await imService.listSubscriptions(provider, robotId);
      setSubscriptions(
        nextSubscriptions.length > 0
          ? nextSubscriptions
          : [createDefaultSubscription(provider, robotId)],
      );
    } catch (error) {
      if (!isUnauthorizedError(error)) {
        toast.error(getErrorMessage(error));
      }
      setSubscriptions([createDefaultSubscription(provider, robotId)]);
    }
  }, [provider]);

  const refreshStatus = useCallback(async (options?: { silent?: boolean; skipSelectedBotUpdate?: boolean }) => {
    if (!options?.silent) setLoadingStatus(true);
    try {
      const nextStatus = await imService.getImStatus();
      const providerStatus = nextStatus[provider] ?? null;
      setStatus(providerStatus);
      onConnectionChange?.(provider, isConnected(providerStatus));

      const currentSelectedBot = selectedBotRef.current;
      if (currentSelectedBot && !options?.skipSelectedBotUpdate) {
        const robotId = provider === 'dingtalk'
          ? currentSelectedBot.clientId
          : provider === 'wecom'
            ? currentSelectedBot.botId
            : currentSelectedBot.ilinkBotId;
            
        const updatedBot = providerStatus?.bots?.find((b: ImConnectionStatus) => {
          if (provider === 'dingtalk') return b.clientId === robotId;
          if (provider === 'wecom') return b.botId === robotId;
          return b.ilinkBotId === robotId;
        }) || currentSelectedBot;
        
        setSelectedBot(updatedBot);
        
        if (provider === 'dingtalk') {
          setClientId(updatedBot.clientId ?? '');
          setBotName(updatedBot.botName ?? '');
        } else if (provider === 'wecom') {
          setBotId(updatedBot.botId ?? '');
          setBotName(updatedBot.botName ?? '');
        } else if (provider === 'wechat') {
          setWechatBotId(updatedBot.ilinkBotId ?? '');
          setWechatUserId(updatedBot.ilinkUserId ?? '');
          setWechatBaseUrl(updatedBot.baseUrl ?? '');
          setQrUrl(updatedBot.qrCodeUrl ?? '');
          setBotName(updatedBot.botName ?? '');
        }
        
        if (robotId) {
          await loadSubscriptionsForBot(robotId);
        }
      }

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
  }, [onConnectionChange, onOpenChange, provider, loadSubscriptionsForBot]);

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
  }, [loadRepositories, open]); // Avoid infinite loops

  const selectedRobotId = useMemo(() => {
    if (!selectedBot) return undefined;
    return provider === 'dingtalk'
      ? selectedBot.clientId
      : provider === 'wecom'
        ? selectedBot.botId
        : selectedBot.ilinkBotId;
  }, [selectedBot, provider]);

  const currentSubscription = subscriptions[0] ?? createDefaultSubscription(provider, selectedRobotId);
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
            setSelectedBot(result.connection);
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
  }, [connected, open, provider, refreshStatus, wecomScode]);

  useEffect(() => {
    if (!open || provider !== 'wechat' || !qrUrl || connected) return;
    const interval = window.setInterval(() => {
      void refreshStatus({ silent: true });
    }, 3000);
    return () => window.clearInterval(interval);
  }, [connected, open, provider, qrUrl, refreshStatus]);

  const handleSelectBot = async (bot: ImConnectionStatus) => {
    setSelectedBot(bot);
    setBotName(bot.botName ?? '');
    setTestResult(null);
    setPairingCode(null);
    
    if (provider === 'dingtalk') {
      setClientId(bot.clientId ?? '');
      setClientSecret('');
    } else if (provider === 'wecom') {
      setBotId(bot.botId ?? '');
      setBotSecret('');
    } else if (provider === 'wechat') {
      setWechatBotId(bot.ilinkBotId ?? '');
      setWechatToken('');
      setWechatUserId(bot.ilinkUserId ?? '');
      setWechatBaseUrl(bot.baseUrl ?? '');
      setQrUrl(bot.qrCodeUrl ?? '');
    }
    
    setIsAdding(false);
    setActiveTab('credentials');
    
    const robotId = provider === 'dingtalk'
      ? bot.clientId
      : provider === 'wecom'
        ? bot.botId
        : bot.ilinkBotId;
    if (robotId) {
      await loadSubscriptionsForBot(robotId);
    }
  };

  const handleAddBotClick = () => {
    setSelectedBot(null);
    setBotName('');
    setTestResult(null);
    setPairingCode(null);
    
    if (provider === 'dingtalk') {
      setClientId('');
      setClientSecret('');
    } else if (provider === 'wecom') {
      setBotId('');
      setBotSecret('');
      setWecomScode('');
      setWecomQrPollStatus('');
      setQrUrl('');
    } else if (provider === 'wechat') {
      setWechatBotId('');
      setWechatToken('');
      setWechatUserId('');
      setWechatBaseUrl('');
      setQrUrl('');
    }
    
    setIsAdding(true);
    setActiveTab('credentials');
    setSubscriptions([createDefaultSubscription(provider)]);
  };

  const handleDeleteBot = async (robotId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (!window.confirm(`确定要删除此${label}配置吗？`)) return;
    try {
      let newStatus;
      if (provider === 'dingtalk') {
        newStatus = await imService.deleteDingTalkConnection(robotId);
      } else if (provider === 'wecom') {
        newStatus = await imService.deleteWecomConnection(robotId);
      } else {
        newStatus = await imService.deleteWechatConnection(robotId);
      }
      setStatus(newStatus[provider] ?? null);
      toast.success('机器人配置已删除');
      
      const currentSelectedId = selectedBot
        ? (provider === 'dingtalk' ? selectedBot.clientId : provider === 'wecom' ? selectedBot.botId : selectedBot.ilinkBotId)
        : null;
      if (currentSelectedId === robotId) {
        setSelectedBot(null);
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  };

  const canSubmitCredentials =
    provider === 'dingtalk'
      ? clientId.trim().length > 0 && (isAdding ? clientSecret.trim().length > 0 : true)
      : provider === 'wecom'
        ? botId.trim().length > 0 && (isAdding ? botSecret.trim().length > 0 : true)
        : (isAdding ? wechatToken.trim().length > 0 : true) && wechatBotId.trim().length > 0 && wechatUserId.trim().length > 0;

  const saveCredentials = async () => {
    if (!canSubmitCredentials) {
      toast.error('请补齐凭证');
      return;
    }
    setSaving(true);
    try {
      let nextStatus;
      if (provider === 'dingtalk') {
        nextStatus = await imService.saveDingTalkConnection({
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
          botName: botName.trim() || undefined,
        });
      } else if (provider === 'wecom') {
        nextStatus = await imService.saveWecomConnection({
          botId: botId.trim(),
          secret: botSecret.trim(),
          botName: botName.trim() || undefined,
        });
      } else {
        nextStatus = await imService.saveWechatConnection({
          botToken: wechatToken.trim(),
          ilinkBotId: wechatBotId.trim(),
          ilinkUserId: wechatUserId.trim(),
          baseUrl: wechatBaseUrl.trim() || undefined,
          botName: botName.trim() || undefined,
        });
      }
      
      toast.success('凭证已保存');
      
      const updatedStatus = await imService.getImStatus();
      const providerStatus = updatedStatus[provider] ?? null;
      setStatus(providerStatus);
      onConnectionChange?.(provider, isConnected(providerStatus));
      
      const robotId = provider === 'dingtalk'
        ? clientId.trim()
        : provider === 'wecom'
          ? botId.trim()
          : wechatBotId.trim();
          
      const foundBot = providerStatus?.bots?.find((b: ImConnectionStatus) => {
        if (provider === 'dingtalk') return b.clientId === robotId;
        if (provider === 'wecom') return b.botId === robotId;
        return b.ilinkBotId === robotId;
      }) || nextStatus;
      
      setSelectedBot(foundBot);
      setIsAdding(false);
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
        const result = await imService.testDingTalkConnection({
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
          botName: botName.trim() || undefined,
        });
        setTestResult(result);
        const nextBotStatus = {
          provider: 'dingtalk' as const,
          clientId: clientId.trim(),
          botName: botName.trim() || undefined,
          state: result.state,
          connected: result.success,
          summary: result.message,
          nextStep: result.nextStep,
          stages: result.stages,
        };
        setSelectedBot(nextBotStatus);
        void refreshStatus({ silent: true });
        toast[result.success ? 'success' : 'error'](result.message);
      } else if (provider === 'wechat') {
        const nextStatus = await imService.startWechat();
        setSelectedBot(nextStatus);
        toast[isConnected(nextStatus) ? 'success' : 'error'](nextStatus.summary || '微信状态已更新');
      } else {
        const nextStatus = await imService.startWecom();
        setSelectedBot(nextStatus);
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
        setSelectedBot(nextStatus);
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
    if (!selectedRobotId) return;
    setSendingTestNotification(true);
    try {
      const result = await imService.sendProviderTestNotification(provider, selectedRobotId);
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
    if (!selectedRobotId) return;
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
      }, provider, selectedRobotId);
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
        
        {/* Level 1: 机器人列表视图 */}
        {!selectedBot && !isAdding ? (
          <>
            <DialogHeader className="shrink-0 flex flex-row items-center justify-between pb-4 border-b border-[var(--github-border)]">
              <div>
                <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
                  <Bot className="h-5 w-5 text-[var(--github-accent)]" />
                  {label}多机器人管理
                </DialogTitle>
                <DialogDescription className="text-[var(--github-text-secondary)] mt-1">
                  同一个{label}渠道中，您可以配置多个不同的机器人，并为其分别指定订阅 of 仓库和规则。
                </DialogDescription>
              </div>
              <Button onClick={handleAddBotClick} className="btn-x-primary h-8 text-xs font-semibold px-3 gap-1">
                <Plus className="h-3.5 w-3.5" />
                新增机器人
              </Button>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto py-4 space-y-3 min-h-0">
              {loadingStatus ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader2 className="h-6 w-6 animate-spin text-[var(--github-accent)]" />
                  <p className="text-xs text-[var(--github-text-secondary)]">加载配置列表中...</p>
                </div>
              ) : bots.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 border border-dashed border-[var(--github-border)] rounded-xl bg-white/[0.01]">
                  <Bot className="h-10 w-10 text-[var(--github-text-secondary)] opacity-50 mb-3" />
                  <p className="text-sm font-medium text-[var(--github-text-secondary)]">暂未配置任何{label}</p>
                  <p className="text-xs text-[var(--github-text-secondary)]/70 mt-1 mb-4">连接自定义{label}以开启通知推送</p>
                  <Button onClick={handleAddBotClick} size="sm" className="btn-x-primary text-xs h-8">
                    添加第一个机器人
                  </Button>
                </div>
              ) : (
                <div className="grid gap-3">
                  {bots.map((bot) => {
                    const isBotReady = bot.state === 'ready';
                    const botIdKey = provider === 'dingtalk'
                      ? bot.clientId
                      : provider === 'wecom'
                        ? bot.botId
                        : bot.ilinkBotId;

                    return (
                      <div
                        key={botIdKey}
                        onClick={() => handleSelectBot(bot)}
                        className="group flex items-center justify-between p-4 rounded-xl border border-[var(--github-border)] bg-card/20 hover:bg-white/5 hover:border-[var(--github-accent)]/30 transition-all cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "flex h-9 w-9 items-center justify-center rounded-lg border transition-all duration-200 bg-white/5 border-border/40",
                            isBotReady && "bg-primary/10 border-primary/20 text-primary"
                          )}>
                            <Bot className="h-4.5 w-4.5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-white group-hover:text-[var(--github-accent)] transition-colors">
                                {bot.botName || `未命名机器人`}
                              </p>
                              {bot.isDefault && (
                                <Badge className="bg-[var(--github-accent)]/15 text-[var(--github-accent)] hover:bg-[var(--github-accent)]/15 border-transparent text-[10px] scale-90">
                                  默认
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-[var(--github-text-secondary)] mt-0.5">
                              {provider === 'dingtalk' ? 'Client ID' : provider === 'wecom' ? 'Bot ID' : 'iLink Bot ID'}: {botIdKey}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge className={cn(
                            "text-[11px] font-medium border-transparent",
                            isBotReady ? "bg-green-400/10 text-green-400" :
                            bot.state === 'error' ? "bg-red-400/10 text-red-400" :
                            "bg-amber-400/10 text-amber-400"
                          )}>
                            {isBotReady ? '在线 / Ready' : bot.state === 'configured' ? '已配置' : '连接异常'}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(event) => handleDeleteBot(botIdKey || '', event)}
                            className="h-8 w-8 text-[var(--github-text-secondary)] hover:text-red-400 hover:bg-white/5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          <ChevronRight className="h-4 w-4 text-[var(--github-text-secondary)] group-hover:text-white transition-colors" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            
            <DialogFooter className="shrink-0 border-t border-[var(--github-border)] pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="border-[var(--github-border)] h-8 text-xs font-semibold rounded-lg">
                关闭
              </Button>
            </DialogFooter>
          </>
        ) : (
          /* Level 2: 机器人详情配置/订阅视图 */
          <>
            <DialogHeader className="shrink-0 border-b border-[var(--github-border)] pb-3">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    resetBotState();
                    void refreshStatus({ skipSelectedBotUpdate: true });
                  }}
                  className="h-8 px-2 text-[var(--github-accent)] hover:bg-white/5 rounded-lg"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  返回列表
                </Button>
                <Separator orientation="vertical" className="h-4 bg-[var(--github-border)]" />
                <DialogTitle className="text-base font-bold text-white">
                  {isAdding ? `新增${label}` : `配置: ${selectedBot?.botName || '未命名机器人'}`}
                </DialogTitle>
                {connected && !isAdding ? (
                  <Badge className="bg-green-400/20 text-green-400">
                    {t('settings.integrations.connected')}
                  </Badge>
                ) : null}
              </div>
              <DialogDescription className="text-[var(--github-text-secondary)] mt-1 ml-2">
                {selectedBot?.summary || testResult?.message || '配置机器人凭证、测试连接状态、完成绑定以及订阅规则设置。'}
              </DialogDescription>
            </DialogHeader>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col gap-4 pt-3">
              <TabsList className="grid w-full shrink-0 grid-cols-4 border border-[var(--github-border)] bg-[var(--github-surface)]">
                <TabsTrigger value="credentials">凭证</TabsTrigger>
                <TabsTrigger value="test" disabled={isAdding}>测试</TabsTrigger>
                <TabsTrigger value="binding" disabled={isAdding}>绑定</TabsTrigger>
                <TabsTrigger value="subscriptions" disabled={isAdding}>订阅</TabsTrigger>
              </TabsList>

              <TabsContent value="credentials" className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                {loadingStatus ? (
                  <div className="flex items-center gap-2 rounded-lg border border-[var(--github-border)] bg-white/5 px-3 py-2 text-xs text-[var(--github-text-secondary)]">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--github-accent)]" />
                    正在同步状态
                  </div>
                ) : null}

                {provider === 'dingtalk' ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="dingtalk-bot-name">机器人名称 (自定义)</Label>
                      <Input
                        id="dingtalk-bot-name"
                        value={botName}
                        onChange={(event) => setBotName(event.target.value)}
                        className="border-[var(--github-border)] bg-[var(--github-surface)]"
                        placeholder="e.g. 钉钉告警机器人"
                      />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Client ID (AppKey)</Label>
                        <Input
                          value={clientId}
                          onChange={(event) => setClientId(event.target.value)}
                          className="border-[var(--github-border)] bg-[var(--github-surface)]"
                          placeholder="dingxxxxxxxx"
                          disabled={!isAdding}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Client Secret (AppSecret)</Label>
                        <Input
                          type="password"
                          value={clientSecret}
                          onChange={(event) => setClientSecret(event.target.value)}
                          className="border-[var(--github-border)] bg-[var(--github-surface)]"
                          placeholder={isAdding ? "••••••••" : "留空则保持原密钥"}
                        />
                      </div>
                    </div>
                  </div>
                ) : provider === 'wecom' ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="wecom-bot-name">机器人名称 (自定义)</Label>
                      <Input
                        id="wecom-bot-name"
                        value={botName}
                        onChange={(event) => setBotName(event.target.value)}
                        className="border-[var(--github-border)] bg-[var(--github-surface)]"
                        placeholder="e.g. 企业微信告警机器人"
                      />
                    </div>
                    <div className="space-y-2">
                      <Button type="button" variant="outline" className="gap-2 border-[var(--github-border)]" onClick={startQrFlow} disabled={testing}>
                        {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        扫码授权
                      </Button>
                      {qrUrl ? (
                        <div className="mt-2 rounded-lg border border-[var(--github-border)] bg-white/5 p-3 text-xs text-[var(--github-text-secondary)]">
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
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Bot ID</Label>
                        <Input
                          value={botId}
                          onChange={(event) => setBotId(event.target.value)}
                          className="border-[var(--github-border)] bg-[var(--github-surface)]"
                          disabled={!isAdding}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Secret</Label>
                        <Input
                          type="password"
                          value={botSecret}
                          onChange={(event) => setBotSecret(event.target.value)}
                          className="border-[var(--github-border)] bg-[var(--github-surface)]"
                          placeholder={isAdding ? "••••••••" : "留空则保持原密钥"}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="wechat-bot-name">机器人名称 (自定义)</Label>
                      <Input
                        id="wechat-bot-name"
                        value={botName}
                        onChange={(event) => setBotName(event.target.value)}
                        className="border-[var(--github-border)] bg-[var(--github-surface)]"
                        placeholder="e.g. 个人微信推送机器人"
                      />
                    </div>
                    <div className="space-y-2">
                      <Button type="button" variant="outline" className="gap-2 border-[var(--github-border)]" onClick={startQrFlow} disabled={testing}>
                        {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        扫码登录
                      </Button>
                      {qrUrl ? (
                        <div className="mt-2 rounded-lg border border-[var(--github-border)] bg-white/5 p-3 text-xs text-[var(--github-text-secondary)]">
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
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Bot Token</Label>
                        <Input
                          type="password"
                          value={wechatToken}
                          onChange={(event) => setWechatToken(event.target.value)}
                          className="border-[var(--github-border)] bg-[var(--github-surface)]"
                          placeholder={isAdding ? "" : "留空则保持原Token"}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>iLink Bot ID</Label>
                        <Input
                          value={wechatBotId}
                          onChange={(event) => setWechatBotId(event.target.value)}
                          className="border-[var(--github-border)] bg-[var(--github-surface)]"
                          disabled={!isAdding}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>iLink User ID</Label>
                        <Input
                          value={wechatUserId}
                          onChange={(event) => setWechatUserId(event.target.value)}
                          className="border-[var(--github-border)] bg-[var(--github-surface)]"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Base URL</Label>
                        <Input
                          value={wechatBaseUrl}
                          onChange={(event) => setWechatBaseUrl(event.target.value)}
                          className="border-[var(--github-border)] bg-[var(--github-surface)]"
                          placeholder="https://ilinkai.weixin.qq.com"
                        />
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
                {(selectedBot?.nextStep || testResult?.nextStep) ? (
                  <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-100">
                    {testResult?.nextStep || selectedBot?.nextStep}
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

            <Separator className="shrink-0 bg-[var(--github-border)] mt-4" />
            <DialogFooter className="shrink-0 gap-2 pt-3">
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
