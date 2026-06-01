import { createPortal } from 'react-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface EventMarkerTooltipProps {
  visible: boolean;
  x: number;
  y: number;
  event: {
    id: string;
    date: string;
    title: string;
    description: string;
    type: string;
    severity: 'info' | 'warning' | 'positive';
  } | null;
  className?: string;
}

const useSafeLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function EventMarkerTooltip({
  visible,
  x,
  y,
  event,
  className,
}: EventMarkerTooltipProps) {
  const { t } = useLanguage();
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState({ left: x + 12, top: y + 12 });

  useSafeLayoutEffect(() => {
    if (!visible || !tooltipRef.current) return;
    const el = tooltipRef.current;

    const tooltipWidth = el.offsetWidth || 280;
    const tooltipHeight = el.offsetHeight || 150;

    let left = x + 12;
    let top = y + 12;

    if (left + tooltipWidth > window.innerWidth) {
      left = x - 12 - tooltipWidth;
    }
    if (top + tooltipHeight > window.innerHeight) {
      top = y - 12 - tooltipHeight;
    }

    left = Math.max(8, Math.min(left, window.innerWidth - tooltipWidth - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - tooltipHeight - 8));

    setAdjustedPos({ left, top });
  }, [visible, x, y]);

  if (!visible || !event) return null;

  const severityDotClass = (severity: string) => {
    switch (severity) {
      case 'positive':
        return 'bg-emerald-400';
      case 'warning':
        return 'bg-amber-400';
      case 'info':
        return 'bg-sky-400';
      default:
        return 'bg-muted-foreground/60';
    }
  };

  const formatDate = (dateStr: string) => {
    return dateStr.replace(/-/g, '.');
  };

  const content = (
    <div
      ref={tooltipRef}
      style={{
        left: `${adjustedPos.left}px`,
        top: `${adjustedPos.top}px`,
        pointerEvents: 'none',
      }}
      className={cn(
        'fixed z-50 rounded-lg border border-border/80 bg-popover/95 p-3 max-w-xs shadow-xl backdrop-blur-md transition-opacity duration-150',
        className,
      )}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className={cn('rounded-full w-2 h-2 flex-shrink-0', severityDotClass(event.severity))}
        />
        <span className="text-xs font-semibold text-foreground truncate max-w-[200px]">
          {event.title}
        </span>
      </div>
      <div className="text-[10px] text-muted-foreground mb-1 tabular-nums">
        {formatDate(event.date)}
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap">
        {event.description}
      </p>
    </div>
  );

  return createPortal(content, document.body);
}
