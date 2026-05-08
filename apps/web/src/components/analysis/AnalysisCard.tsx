import type { EventAnalysis } from '@/types/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RiskBadge } from './RiskBadge';
import { CategoryBadge } from './CategoryBadge';
import { EventContextChips } from '@/components/shared/EventContextChips';

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
}

function AnalysisStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'COMPLETED':
      return (
        <Badge className="bg-green-400/20 text-green-400">
          {statusLabels[status]}
        </Badge>
      );
    case 'FAILED':
      return (
        <Badge className="bg-red-400/20 text-red-400">
          {statusLabels[status]}
        </Badge>
      );
    case 'PROCESSING':
      return (
        <Badge className="bg-blue-400/20 text-blue-400">
          {statusLabels[status]}
        </Badge>
      );
    case 'PENDING':
      return (
        <Badge className="bg-yellow-400/20 text-yellow-400">
          {statusLabels[status]}
        </Badge>
      );
    case 'SKIPPED':
      return (
        <Badge variant="secondary">
          {statusLabels[status]}
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export function AnalysisCard({ analysis }: AnalysisCardProps) {
  return (
    <Card className="hover:bg-accent/5 transition-colors cursor-pointer">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <RiskBadge riskLevel={analysis.riskLevel} />
              <CategoryBadge category={analysis.category} />
              <AnalysisStatusBadge status={analysis.status} />
            </div>

            <p className="text-sm text-foreground line-clamp-2 mb-1">
              {analysis.summaryShort || analysis.summary}
            </p>

            {analysis.event?.title ? (
              <p className="text-xs text-muted-foreground line-clamp-1">
                {analysis.event.title}
              </p>
            ) : null}

            <EventContextChips event={analysis.event} className="mt-3" />

            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
              {analysis.tags.length > 0 && (
                <span className="truncate">
                  {analysis.tags.slice(0, 3).join(' / ')}
                </span>
              )}
              <span>
                {actionLabels[analysis.suggestedAction] ?? analysis.suggestedAction}
              </span>
            </div>
          </div>

          <div className="text-right shrink-0">
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
      </CardContent>
    </Card>
  );
}
