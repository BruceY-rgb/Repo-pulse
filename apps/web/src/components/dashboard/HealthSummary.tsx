import { useLanguage } from '@/contexts/LanguageContext';
import type { ProjectRiverHealthSignal } from '@/services/dashboard.service';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface HealthSummaryProps {
  signals?: ProjectRiverHealthSignal[];
  className?: string;
}

const severityConfig = {
  warning: {
    bg: 'bg-amber-500/10 dark:bg-amber-950/30',
    border: 'border-amber-500/30 dark:border-amber-800/40',
    text: 'text-amber-600 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
  positive: {
    bg: 'bg-emerald-500/10 dark:bg-emerald-950/30',
    border: 'border-emerald-500/30 dark:border-emerald-800/40',
    text: 'text-emerald-600 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
  info: {
    bg: 'bg-sky-500/10 dark:bg-sky-950/30',
    border: 'border-sky-500/30 dark:border-sky-800/40',
    text: 'text-sky-600 dark:text-sky-300',
    dot: 'bg-sky-500',
  },
} as const;

export function HealthSummary({ signals = [], className }: HealthSummaryProps) {
  const { t } = useLanguage();

  if (signals.length === 0) return null;

  // Cast params values to string for translation lookup
  const getParams = (params?: Record<string, string | number>) => {
    if (!params) return undefined;
    return Object.fromEntries(
      Object.entries(params).map(([key, val]) => [key, String(val)]),
    );
  };

  return (
    <TooltipProvider delayDuration={150}>
      <div className={cn('flex flex-wrap gap-2.5', className)}>
        {signals.map((signal) => {
          const config = severityConfig[signal.severity] || severityConfig.info;
          return (
            <Tooltip key={signal.id}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold select-none cursor-help transition-all hover:scale-105 active:scale-95 shadow-sm',
                    config.bg,
                    config.border,
                    config.text,
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', config.dot)} />
                  <span>{t(signal.label)}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                align="start"
                className="max-w-[280px] rounded-lg border border-border/80 bg-popover px-3 py-2 text-xs font-normal leading-relaxed text-popover-foreground shadow-xl backdrop-blur-md"
              >
                {t(signal.evidence, getParams(signal.evidenceParams))}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
