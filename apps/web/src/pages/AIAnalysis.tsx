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
import { useAnalysisList, useTriggerAnalysis, analysisQueryKeys } from '@/hooks/use-analysis';
import { analysisService } from '@/services/analysis.service';
import { useQueryClient } from '@tanstack/react-query';
import { useLanguage } from '@/contexts/LanguageContext';
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
  const { t } = useLanguage();
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-foreground font-medium">{t('analysis.empty.title')}</p>
      <p className="text-sm text-muted-foreground mt-1">{t('analysis.empty.subtitle')}</p>
    </div>
  );
}

function RefreshingIndicator() {
  const { t } = useLanguage();
  return (
    <div className="flex items-center justify-center py-2">
      <Loader2 className="w-4 h-4 text-muted-foreground animate-spin mr-2" />
      <span className="text-xs text-muted-foreground">{t('analysis.refreshing')}</span>
    </div>
  );
}

export function AIAnalysis() {
  const { t } = useLanguage();
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

  const queryClient = useQueryClient();
  const triggerMutation = useTriggerAnalysis();

  const handleReanalyze = (eventId: string) => {
    triggerMutation.mutate({ eventId, force: true });
  };

  const handleDelete = async (analysisId: string) => {
    try {
      await analysisService.deleteAnalysis(analysisId);
      setSelected(null);
      queryClient.invalidateQueries({ queryKey: analysisQueryKeys.all });
    } catch {
      // ignore
    }
  };

  // 仅首次加载（data 尚未出现）显示 Skeleton
  const isInitialLoad = isLoading && data === undefined;

  // Error state
  if (error && data === undefined) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t('analysis.page.title')}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t('analysis.page.subtitle')}</p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="w-12 h-12 text-destructive mb-4" />
          <p className="text-foreground font-medium">{t('analysis.error.loadFailed')}</p>
          <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
          <Button variant="outline" className="mt-4" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            {t('analysis.error.retry')}
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
          <h1 className="text-2xl font-bold text-foreground">{t('analysis.page.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('analysis.page.subtitle')}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={riskLevel} onValueChange={(v) => { setRiskLevel(v); setPage(1); }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder={t('analysis.riskLevel')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('analysis.filter.all')}</SelectItem>
            <SelectItem value="LOW">{t('analysis.filter.low')}</SelectItem>
            <SelectItem value="MEDIUM">{t('analysis.filter.medium')}</SelectItem>
            <SelectItem value="HIGH">{t('analysis.filter.high')}</SelectItem>
            <SelectItem value="CRITICAL">{t('analysis.filter.critical')}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={category} onValueChange={(v) => { setCategory(v); setPage(1); }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder={t('analysis.category')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('analysis.filter.all')}</SelectItem>
            <SelectItem value="FEATURE">{t('analysis.filter.feature')}</SelectItem>
            <SelectItem value="BUGFIX">{t('analysis.filter.bugfix')}</SelectItem>
            <SelectItem value="REFACTOR">{t('analysis.filter.refactor')}</SelectItem>
            <SelectItem value="SECURITY">{t('analysis.filter.security')}</SelectItem>
            <SelectItem value="DEPENDENCY">{t('analysis.filter.dependency')}</SelectItem>
            <SelectItem value="DOCS">{t('analysis.filter.docs')}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder={t('analysis.status')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('analysis.filter.all')}</SelectItem>
            <SelectItem value="COMPLETED">{t('analysis.filter.completed')}</SelectItem>
            <SelectItem value="FAILED">{t('analysis.filter.failed')}</SelectItem>
            <SelectItem value="PROCESSING">{t('analysis.filter.processing')}</SelectItem>
            <SelectItem value="SKIPPED">{t('analysis.filter.skipped')}</SelectItem>
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
                  <AnalysisCard
                    key={analysis.id}
                    analysis={analysis}
                    onClick={() => setSelected(analysis)}
                    onDelete={handleDelete}
                  />
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
                    {t('analysis.pagination.previous')}
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {t('analysis.pagination.page', { current: String(page), total: String(totalPages) })}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {t('analysis.pagination.next')}
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
            <SheetTitle>{t('analysis.detail.title')}</SheetTitle>
          </SheetHeader>
          {selected && (
            <div className="mt-6">
              <AnalysisDetail
                analysis={selected}
                onReanalyze={() => {
                  if (selected) handleReanalyze(selected.eventId);
                }}
                onDelete={() => {
                  if (selected) handleDelete(selected.id);
                }}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
