import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const riskConfig: Record<string, string> = {
  LOW: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/20',
  MEDIUM: 'bg-yellow-500/15 text-yellow-500 border-yellow-500/20',
  HIGH: 'bg-orange-500/15 text-orange-500 border-orange-500/20',
  CRITICAL: 'bg-destructive/15 text-destructive border-destructive/20',
};

interface RiskBadgeProps {
  riskLevel: string;
  className?: string;
}

export function RiskBadge({ riskLevel, className }: RiskBadgeProps) {
  const style = riskConfig[riskLevel?.toUpperCase()] ?? '';

  return (
    <Badge
      variant="outline"
      className={cn('font-semibold text-xs', style, className)}
    >
      {riskLevel ?? 'UNKNOWN'}
    </Badge>
  );
}
