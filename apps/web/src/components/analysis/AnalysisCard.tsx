import type { EventAnalysis } from '@/types/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RiskBadge } from './RiskBadge';
import { CategoryBadge } from './CategoryBadge';
import { Trash2 } from 'lucide-react';

const actionLabels: Record<string, string> = {
  REVIEW_REQUIRED: 'Needs Review',
  TEST_REQUIRED: 'Needs Test',
  SAFE_TO_IGNORE: 'Safe',
  NOTIFY_OWNER: 'Notify Owner',
  CREATE_APPROVAL: 'Approval',
};

const statusLabels: Record<string, string> = {
  PENDING: 'Pending',
  PROCESSING: 'Processing',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  SKIPPED: 'Skipped',
};

interface AnalysisCardProps {
  analysis: EventAnalysis;
  onClick?: () => void;
  onDelete?: (analysisId: string) => void;
}

export function AnalysisCard({ analysis, onClick, onDelete }: AnalysisCardProps) {
  return (
    <Card className="hover:bg-accent/5 transition-colors cursor-pointer group" onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <RiskBadge riskLevel={analysis.riskLevel} />
              <CategoryBadge category={analysis.category} />
              {analysis.status === 'PROCESSING' && (
                <span className="text-xs text-muted-foreground animate-pulse">
                  Analyzing...
                </span>
              )}
            </div>

            <p className="text-sm text-foreground line-clamp-2 mb-1">
              {analysis.summaryShort || analysis.summary}
            </p>

            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
              {analysis.tags.length > 0 && (
                <span className="truncate">
                  {analysis.tags.slice(0, 3).join(' / ')}
                </span>
              )}
              <span>
                {actionLabels[analysis.suggestedAction] ?? analysis.suggestedAction}
              </span>
              <span>{statusLabels[analysis.status] ?? analysis.status}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-400"
                onClick={(e) => { e.stopPropagation(); onDelete(analysis.id); }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <div className="text-right">
              <div className="text-xs text-muted-foreground">
                {analysis.createdAt
                  ? new Date(analysis.createdAt).toLocaleDateString()
                  : ''}
              </div>
              {analysis.confidence > 0 && (
                <div className="text-xs text-muted-foreground mt-1">
                  {(analysis.confidence * 100).toFixed(0)}% conf
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
