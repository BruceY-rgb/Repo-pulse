import type { EventAnalysis } from '@/types/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RiskBadge } from './RiskBadge';
import { CategoryBadge } from './CategoryBadge';
import { Brain } from 'lucide-react';

interface AnalysisDetailProps {
  analysis: EventAnalysis;
  onReanalyze?: () => void;
}

export function AnalysisDetail({ analysis, onReanalyze }: AnalysisDetailProps) {
  return (
    <div className="space-y-4">
      {/* Summary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary" />
            AI Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <RiskBadge riskLevel={analysis.riskLevel} />
            <CategoryBadge category={analysis.category} />
            <span className="text-sm text-muted-foreground">
              Score: {analysis.riskScore}/100 · {(analysis.confidence * 100).toFixed(0)}% confidence
            </span>
          </div>

          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase">
              Summary
            </span>
            <p className="text-sm text-foreground mt-1 leading-relaxed">
              {analysis.summaryLong || analysis.summary}
            </p>
          </div>

          {analysis.riskReasons.length > 0 && (
            <div>
              <span className="text-xs font-medium text-muted-foreground uppercase">
                Risk Reasons
              </span>
              <ul className="mt-1 space-y-1">
                {analysis.riskReasons.map((r, i) => (
                  <li key={i} className="text-sm text-foreground pl-3 border-l-2 border-destructive/30">
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Impact & Tags */}
      <Card>
        <CardContent className="p-4 space-y-3">
          {analysis.impactSummary && (
            <div>
              <span className="text-xs font-medium text-muted-foreground uppercase">
                Impact
              </span>
              <p className="text-sm text-foreground mt-1">
                {analysis.impactSummary}
              </p>
            </div>
          )}

          {analysis.affectedAreas.length > 0 && (
            <div>
              <span className="text-xs font-medium text-muted-foreground uppercase">
                Affected Areas
              </span>
              <div className="flex flex-wrap gap-1 mt-1">
                {analysis.affectedAreas.map((a) => (
                  <Badge key={a} variant="secondary" className="text-xs">
                    {a}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {analysis.tags.length > 0 && (
            <div>
              <span className="text-xs font-medium text-muted-foreground uppercase">
                Tags
              </span>
              <div className="flex flex-wrap gap-1 mt-1">
                {analysis.tags.map((t) => (
                  <Badge key={t} variant="outline" className="text-xs">
                    {t}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action */}
      <div className="flex items-center justify-between">
        <div className="text-sm">
          <span className="text-muted-foreground">Suggested: </span>
          <span className="font-medium text-foreground">
            {analysis.suggestedAction?.replace(/_/g, ' ')}
          </span>
          <span className="text-muted-foreground ml-2">
            · Model: {analysis.model} · {analysis.tokensUsed} tokens · {analysis.latencyMs}ms
          </span>
        </div>
        {onReanalyze && (
          <Button variant="outline" size="sm" onClick={onReanalyze}>
            Re-analyze
          </Button>
        )}
      </div>
    </div>
  );
}
