import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AnalysisCard } from '@/components/analysis/AnalysisCard';
import { AnalysisDetail } from '@/components/analysis/AnalysisDetail';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useAnalysisList, useTriggerAnalysis } from '@/hooks/use-analysis';
import type { EventAnalysis } from '@/types/api';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';

function InitialSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-xl bg-muted" />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-foreground font-medium">No analyses yet</p>
      <p className="text-sm text-muted-foreground mt-1">
        AI analyses will appear here once events are processed.
      </p>
    </div>
  );
}

function RefreshingIndicator() {
  return (
    <div className="flex items-center justify-center py-2">
      <Loader2 className="w-4 h-4 text-muted-foreground animate-spin mr-2" />
      <span className="text-xs text-muted-foreground">Refreshing...</span>
    </div>
  );
}

export function AIAnalysis() {
  const [riskLevel, setRiskLevel] = useState<string>('all');
  const [category, setCategory] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<EventAnalysis | null>(null);

  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useAnalysisList({
    page,
    pageSize: 20,
    riskLevel: riskLevel !== 'all' ? riskLevel : undefined,
    category: category !== 'all' ? category : undefined,
    status: status !== 'all' ? status : undefined,
  });

  const triggerMutation = useTriggerAnalysis();

  const handleReanalyze = (eventId: string) => {
    triggerMutation.mutate({ eventId, force: true });
  };

  // 仅首次加载（data 尚未出现）显示 Skeleton
  const isInitialLoad = isLoading && data === undefined;

  // Error state
  if (error && data === undefined) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">AI Analysis</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Intelligent code review and risk assessment
            </p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="w-12 h-12 text-destructive mb-4" />
          <p className="text-foreground font-medium">Failed to load analyses</p>
          <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
          <Button variant="outline" className="mt-4" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const items = data?.items ?? [];
  const totalPages = data?.totalPages ?? 0;
  // 筛选切换或后台刷新（已有数据时）仅显示轻量刷新指示器
  const isRefreshing = isFetching && !isLoading;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">AI Analysis</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Intelligent code review and risk assessment
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={riskLevel} onValueChange={(v) => { setRiskLevel(v); setPage(1); }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Risk Level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="LOW">Low</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
            <SelectItem value="CRITICAL">Critical</SelectItem>
          </SelectContent>
        </Select>

        <Select value={category} onValueChange={(v) => { setCategory(v); setPage(1); }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="FEATURE">Feature</SelectItem>
            <SelectItem value="BUGFIX">Bug Fix</SelectItem>
            <SelectItem value="REFACTOR">Refactor</SelectItem>
            <SelectItem value="SECURITY">Security</SelectItem>
            <SelectItem value="DEPENDENCY">Dependency</SelectItem>
            <SelectItem value="DOCS">Docs</SelectItem>
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
            <SelectItem value="FAILED">Failed</SelectItem>
            <SelectItem value="PROCESSING">Processing</SelectItem>
            <SelectItem value="SKIPPED">Skipped</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Body */}
      {isInitialLoad ? (
        <InitialSkeleton />
      ) : (
        <>
          {/* 筛选切换时的轻量刷新提示（不替换列表主体） */}
          {isRefreshing && <RefreshingIndicator />}

          {items.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              {/* List */}
              <div className="space-y-3">
                {items.map((analysis) => (
                  <div
                    key={analysis.id}
                    onClick={() => setSelected(analysis)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setSelected(analysis);
                    }}
                  >
                    <AnalysisCard analysis={analysis} />
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Detail Sheet */}
      <Sheet open={!!selected} onOpenChange={() => setSelected(null)}>
        <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Analysis Detail</SheetTitle>
          </SheetHeader>
          {selected && (
            <div className="mt-6">
              <AnalysisDetail
                analysis={selected}
                onReanalyze={() => {
                  if (selected) handleReanalyze(selected.eventId);
                }}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
