import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, RefreshCw, Radio } from 'lucide-react';
import { toast } from 'sonner';
import type { DesktopTunnelStatus } from '@repo-pulse/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { isDesktopRuntime } from '@/lib/desktop';
import { cn } from '@/lib/utils';

/** state → 圆点颜色（仅用样式变量，禁硬编码十六进制色）。 */
const DOT_COLOR_CLASS: Record<DesktopTunnelStatus['state'], string> = {
  running: 'bg-[var(--github-success)]',
  error: 'bg-[var(--github-danger)]',
  starting: 'bg-muted-foreground animate-pulse',
  idle: 'bg-muted-foreground',
  stopped: 'bg-muted-foreground',
};

/** state → 中文标签。 */
const STATE_LABEL: Record<DesktopTunnelStatus['state'], string> = {
  running: '已连接',
  error: '错误',
  starting: '连接中',
  idle: '未启动',
  stopped: '已停止',
};

function StatusBadge({ state }: { state: DesktopTunnelStatus['state'] }) {
  return (
    <Badge variant="outline" className="gap-1.5">
      <span className={cn('h-2 w-2 rounded-full', DOT_COLOR_CLASS[state])} />
      {STATE_LABEL[state]}
    </Badge>
  );
}

/**
 * 桌面端「实时连接（隧道）」状态卡：显示 cloudflared 隧道当前状态与公网 URL，
 * 并提供「刷新」按钮（重启隧道拿新 URL + 重新同步后端 webhook）。仅桌面运行时渲染。
 *
 * - 刷新走 TanStack Query useMutation 包裹 window.repoPulseDesktop.tunnel.refresh()。
 * - 状态通过 tunnel.onStatus 订阅实时更新（合法的事件订阅，非数据拉取）。
 */
export function TunnelStatusCard() {
  // 初始快照来自最近一次 refresh 的返回值或 onStatus 推送；首帧默认 idle。
  const [status, setStatus] = useState<DesktopTunnelStatus>({ state: 'idle' });

  const refreshMutation = useMutation({
    mutationFn: async (): Promise<DesktopTunnelStatus> => {
      const bridge = window.repoPulseDesktop?.tunnel;
      if (!bridge) {
        throw new Error('桌面隧道桥接不可用');
      }
      return bridge.refresh();
    },
    onSuccess: (next) => {
      setStatus(next);
      if (next.state === 'error') {
        toast.error(`隧道刷新失败：${next.error ?? '未知错误'}`);
      } else {
        toast.success('隧道已刷新');
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '隧道刷新失败');
    },
  });

  // 订阅主进程实时状态推送（starting/running/error + publicUrl）。
  useEffect(() => {
    const bridge = window.repoPulseDesktop?.tunnel;
    if (!bridge) {
      return;
    }
    const unsubscribe = bridge.onStatus((next) => setStatus(next));
    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <Card className="card-github">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base font-semibold text-white">实时连接（隧道）</CardTitle>
          </div>
          <StatusBadge state={status.state} />
        </div>
        <CardDescription className="text-xs text-muted-foreground">
          桌面端通过 cloudflared 隧道把 GitHub webhook 打回本机。隧道 URL 每次重启会变；点击刷新可重连并同步到所有仓库。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {status.state === 'running' && status.publicUrl ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="shrink-0">公网地址：</span>
            <code
              className="truncate rounded bg-secondary px-2 py-0.5 font-mono text-foreground"
              title={status.publicUrl}
            >
              {status.publicUrl}
            </code>
          </div>
        ) : null}
        {status.state === 'error' && status.error ? (
          <p className="text-xs text-[var(--github-danger)]">{status.error}</p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending || status.state === 'starting'}
        >
          {refreshMutation.isPending || status.state === 'starting' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          刷新隧道
        </Button>
      </CardContent>
    </Card>
  );
}

/** 仅桌面运行时渲染隧道状态卡，其余环境返回 null（避免在浏览器侧渲染无用 UI）。 */
export function DesktopTunnelStatusCard() {
  if (!isDesktopRuntime()) {
    return null;
  }
  return <TunnelStatusCard />;
}
