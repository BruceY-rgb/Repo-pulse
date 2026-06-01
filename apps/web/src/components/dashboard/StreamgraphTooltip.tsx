import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

type Granularity = 'day' | 'week' | 'month';

interface StreamgraphTooltipProps {
  visible: boolean;
  x: number;
  y: number;
  contributor: string;
  date: string;
  commits: number;
  linesAdded: number;
  linesDeleted: number;
  filesTouched: number;
  percentage: number;
  totalCommits?: number;
  granularity?: Granularity;
  className?: string;
}

const useSafeLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function StreamgraphTooltip({
  visible,
  x,
  y,
  contributor,
  date,
  commits,
  linesAdded,
  linesDeleted,
  filesTouched,
  percentage,
  totalCommits = 0,
  granularity = 'day',
  className,
}: StreamgraphTooltipProps) {
  const { t } = useLanguage();
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState({ left: x + 12, top: y + 12 });

  useSafeLayoutEffect(() => {
    if (!visible || !tooltipRef.current) return;
    const el = tooltipRef.current;
    const parent = el.parentElement;
    if (!parent) return;

    const parentRect = parent.getBoundingClientRect();
    const tooltipWidth = el.offsetWidth || 180;
    const tooltipHeight = el.offsetHeight || 135;

    let left = x + 12;
    let top = y + 12;

    if (left + tooltipWidth > parentRect.width) {
      left = x - 12 - tooltipWidth;
    }
    if (top + tooltipHeight > parentRect.height) {
      top = y - 12 - tooltipHeight;
    }

    left = Math.max(8, Math.min(left, parentRect.width - tooltipWidth - 8));
    top = Math.max(8, Math.min(top, parentRect.height - tooltipHeight - 8));

    setAdjustedPos({ left, top });
  }, [visible, x, y]);

  if (!visible) return null;

  const getFormattedDate = () => {
    if (!date) return '';
    if (granularity === 'week') {
      const match = date.match(/^(\d{4})-W(\d{2})$/);
      if (match) return `${match[1]} W${Number(match[2])}`;
      const dt = new Date(date);
      const jan1 = new Date(dt.getUTCFullYear(), 0, 1);
      const week = Math.ceil(
        ((dt.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7,
      );
      return `${dt.getUTCFullYear()} W${week}`;
    }
    if (granularity === 'month') {
      return date.substring(0, 7);
    }
    return date;
  };

  const totalLines = linesAdded + linesDeleted;
  const labelKey =
    granularity === 'month'
      ? 'tooltip.monthTotal'
      : granularity === 'week'
      ? 'tooltip.weekTotal'
      : 'tooltip.dayTotal';

  return (
    <div
      ref={tooltipRef}
      style={{
        left: `${adjustedPos.left}px`,
        top: `${adjustedPos.top}px`,
        pointerEvents: 'none',
      }}
      className={cn(
        'absolute z-50 min-w-[170px] rounded-lg border border-border/80 bg-popover/95 px-3.5 py-2 shadow-xl backdrop-blur-md transition-all',
        className,
      )}
    >
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-foreground truncate max-w-[140px]">
          {contributor === 'Other contributors' ? t('projectRiver.otherContributors') : contributor}
        </span>
        {percentage > 0 ? (
          <span className="shrink-0 text-xs font-medium text-sky-500">
            {percentage}%
          </span>
        ) : null}
      </div>
      <div className="mb-2 text-[10px] text-muted-foreground">
        {getFormattedDate()}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
        <div>
          <div className="text-[10px] text-muted-foreground">
            {t('tooltip.commits')}
          </div>
          <div className="font-semibold text-foreground">{commits}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">
            {t('tooltip.linesChanged')}
          </div>
          <div className="font-semibold text-foreground">
            {totalLines > 0 ? (
              <span className="inline-flex gap-0.5">
                <span className="text-emerald-500">+{linesAdded}</span>
                <span className="text-rose-500">-{linesDeleted}</span>
              </span>
            ) : (
              '0'
            )}
          </div>
        </div>
        {totalCommits !== undefined && totalCommits > 0 ? (
          <div>
            <div className="text-[10px] text-muted-foreground">
              {t(labelKey)}
            </div>
            <div className="font-semibold text-foreground">{totalCommits}</div>
          </div>
        ) : null}
        <div>
          <div className="text-[10px] text-muted-foreground">
            {t('tooltip.filesChanged')}
          </div>
          <div className="font-semibold text-foreground">{filesTouched}</div>
        </div>
      </div>
    </div>
  );
}
