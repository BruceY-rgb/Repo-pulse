import { useState, useEffect, useRef, useMemo } from 'react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ResizeHandle } from './ResizeHandle';
import { DraggablePanel } from './DraggablePanel';

interface ProjectLayoutProps {
  chart: ReactNode;
  panel: ReactNode;
  panelWidth?: number;
  panelHeight?: number;
  className?: string;
}

export type DockedEdge = 'top' | 'left' | 'right' | 'bottom' | null;

interface ProjectLayoutProps {
  chart: ReactNode;
  panel: ReactNode;
  panelWidth?: number;
  panelHeight?: number;
  className?: string;
  dockedEdge?: DockedEdge;
  onDockEdgeChange?: (edge: DockedEdge) => void;
}

const CHART_MIN = 340;
const PANEL_MIN_V = 200;
const PANEL_MIN_H = 160;

export function ProjectLayout({
  chart,
  panel,
  panelWidth = 360,
  panelHeight = 0,
  className,
  dockedEdge: controlledDockedEdge,
  onDockEdgeChange,
}: ProjectLayoutProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [layoutWidth, setLayoutWidth] = useState(1200);
  const [layoutHeight, setLayoutHeight] = useState(800);

  // Initialize state from localStorage or default values
  const [localDockedEdge, setLocalDockedEdge] = useState<DockedEdge>(() => {
    const saved = localStorage.getItem('pr:dockedEdge');
    return saved !== null ? (saved === 'null' ? null : (saved as DockedEdge)) : 'bottom';
  });

  const dockedEdge = controlledDockedEdge !== undefined ? controlledDockedEdge : localDockedEdge;

  const setDockedEdge = (edge: DockedEdge) => {
    if (onDockEdgeChange) {
      onDockEdgeChange(edge);
    } else {
      setLocalDockedEdge(edge);
    }
  };

  const [panelW, setPanelW] = useState<number>(() => {
    const saved = localStorage.getItem('pr:panelW');
    return saved ? Number(saved) : panelWidth;
  });
  const [panelH, setPanelH] = useState<number>(() => {
    const saved = localStorage.getItem('pr:panelH');
    return saved ? Number(saved) : panelHeight;
  });
  const [floatX, setFloatX] = useState<number>(() => {
    const saved = localStorage.getItem('pr:floatX');
    return saved ? Number(saved) : 100;
  });
  const [floatY, setFloatY] = useState<number>(() => {
    const saved = localStorage.getItem('pr:floatY');
    return saved ? Number(saved) : 200;
  });

  const [previewEdge, setPreviewEdge] = useState<DockedEdge>(null);

  // Sync state to localStorage
  useEffect(() => {
    localStorage.setItem('pr:dockedEdge', dockedEdge === null ? 'null' : dockedEdge);
  }, [dockedEdge]);

  useEffect(() => {
    localStorage.setItem('pr:panelW', String(panelW));
  }, [panelW]);

  useEffect(() => {
    localStorage.setItem('pr:panelH', String(panelH));
  }, [panelH]);

  useEffect(() => {
    localStorage.setItem('pr:floatX', String(floatX));
    localStorage.setItem('pr:floatY', String(floatY));
  }, [floatX, floatY]);

  // Track parent container size
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setLayoutWidth(width || 1200);
        setLayoutHeight(height || 800);
      }
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, []);

  // Derive panelH with initialization and clamping from layout size
  const activePanelH = useMemo(() => {
    if (layoutHeight <= 0) return panelH;
    if (panelH === 0) {
      const defaultH = Math.min(
        Math.floor((layoutHeight * 2) / 3),
        layoutHeight - CHART_MIN,
      );
      return Math.max(PANEL_MIN_H, defaultH);
    }
    const maxH = layoutHeight - CHART_MIN;
    if (maxH <= PANEL_MIN_H) return PANEL_MIN_H;
    return Math.min(panelH, maxH);
  }, [layoutHeight, panelH]);

  // Derive panelW with clamping from layout size
  const activePanelW = useMemo(() => {
    if (layoutWidth <= 0) return panelW;
    const maxW = layoutWidth - CHART_MIN;
    if (maxW <= PANEL_MIN_V) return PANEL_MIN_V;
    return Math.min(panelW, maxW);
  }, [layoutWidth, panelW]);

  const handleResizeMove = (delta: number) => {
    if (!dockedEdge) return;
    if (dockedEdge === 'top') {
      setPanelH((prev) =>
        Math.max(PANEL_MIN_H, Math.min(prev + delta, layoutHeight - CHART_MIN)),
      );
    } else if (dockedEdge === 'bottom') {
      setPanelH((prev) =>
        Math.max(PANEL_MIN_H, Math.min(prev - delta, layoutHeight - CHART_MIN)),
      );
    } else if (dockedEdge === 'left') {
      setPanelW((prev) =>
        Math.max(PANEL_MIN_V, Math.min(prev + delta, layoutWidth - CHART_MIN)),
      );
    } else if (dockedEdge === 'right') {
      setPanelW((prev) =>
        Math.max(PANEL_MIN_V, Math.min(prev - delta, layoutWidth - CHART_MIN)),
      );
    }
  };

  // Determine grid classes based on docking edge
  const gridClass = dockedEdge
    ? {
        top: 'grid-rows-[auto_1fr]',
        bottom: 'grid-rows-[1fr_auto]',
        left: 'grid-cols-[auto_1fr]',
        right: 'grid-cols-[1fr_auto]',
      }[dockedEdge]
    : '';

  const chartGridClass = dockedEdge
    ? {
        top: 'row-start-2 col-start-1',
        bottom: 'row-start-1 col-start-1',
        left: 'row-start-1 col-start-2',
        right: 'row-start-1 col-start-1',
      }[dockedEdge]
    : '';

  const panelGridClass = dockedEdge
    ? {
        top: 'row-start-1 col-start-1',
        bottom: 'row-start-2 col-start-1',
        left: 'row-start-1 col-start-1',
        right: 'row-start-1 col-start-2',
      }[dockedEdge]
    : '';

  const chartStyle = () => {
    if (dockedEdge === 'top' || dockedEdge === 'bottom') {
      return { width: '100%', height: `${layoutHeight - activePanelH}px` };
    }
    if (dockedEdge === 'left' || dockedEdge === 'right') {
      return { width: `${layoutWidth - activePanelW}px`, height: '100%' };
    }
    return { width: '100%', height: '100%' };
  };

  const panelStyle = () => {
    if (dockedEdge === 'top' || dockedEdge === 'bottom') {
      return { width: '100%', height: `${activePanelH}px` };
    }
    if (dockedEdge === 'left' || dockedEdge === 'right') {
      return { width: `${activePanelW}px`, height: '100%' };
    }
    return {};
  };

  const previewShadowClass = previewEdge
    ? {
        top: 'shadow-[inset_0_12px_0_0_rgba(99,102,241,0.22)]',
        bottom: 'shadow-[inset_0_-12px_0_0_rgba(99,102,241,0.22)]',
        left: 'shadow-[inset_12px_0_0_0_rgba(99,102,241,0.22)]',
        right: 'shadow-[inset_-12px_0_0_rgba(99,102,241,0.22)]',
      }[previewEdge]
    : '';

  const resizeOrientation =
    dockedEdge === 'top' || dockedEdge === 'bottom' ? 'horizontal' : 'vertical';

  const resizeHandleClass = dockedEdge
    ? {
        top: 'absolute bottom-0 left-0 right-0 w-full h-3 border-b border-border bg-transparent',
        bottom: 'absolute top-0 left-0 right-0 w-full h-3 border-t border-border bg-transparent',
        left: 'absolute right-0 top-0 bottom-0 w-3 h-full border-r border-border bg-transparent',
        right: 'absolute left-0 top-0 bottom-0 w-3 h-full border-l border-border bg-transparent',
      }[dockedEdge]
    : '';

  const contentPaddingClass = dockedEdge
    ? {
        top: 'pb-3',
        bottom: 'pt-3',
        left: 'pr-3',
        right: 'pl-3',
      }[dockedEdge]
    : '';

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full h-full overflow-hidden transition-all duration-200 bg-background/50',
        previewShadowClass,
        className,
      )}
    >
      <div className={cn('w-full h-full', dockedEdge && 'grid', gridClass)}>
        {/* Chart View Area */}
        <div
          className={cn('relative overflow-hidden min-w-0 min-h-0', chartGridClass)}
          style={chartStyle()}
        >
          {chart}
        </div>

        {/* Docked Panel View Area */}
        {dockedEdge ? (
          <div
            className={cn(
              'relative flex flex-col min-w-0 min-h-0 border-border bg-card/65 backdrop-blur-sm',
              panelGridClass,
              {
                'border-b': dockedEdge === 'top',
                'border-t': dockedEdge === 'bottom',
                'border-r': dockedEdge === 'left',
                'border-l': dockedEdge === 'right',
              },
            )}
            style={panelStyle()}
          >
            <ResizeHandle
              orientation={resizeOrientation}
              className={resizeHandleClass}
              onMove={handleResizeMove}
            />
            <div className={cn('flex-1 min-h-0 overflow-hidden flex flex-col', contentPaddingClass)}>
              <div className="flex shrink-0 items-center justify-between border-b border-border/60 bg-accent/10 px-4 py-1.5 z-20">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {dockedEdge === 'bottom' || dockedEdge === 'top' ? 'Docked Insights' : 'Insights'}
                </span>
                <button
                  type="button"
                  onClick={() => setDockedEdge(null)}
                  className="rounded border border-border bg-popover/90 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent hover:text-foreground shadow-xs transition-colors"
                >
                  Undock Panel
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                {panel}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Floating Panel View Area */}
      {!dockedEdge ? (
        <DraggablePanel
          x={floatX}
          y={floatY}
          onChange={(nx, ny) => {
            setFloatX(nx);
            setFloatY(ny);
          }}
          onDock={(edge) => setDockedEdge(edge)}
          onPreview={(edge) => setPreviewEdge(edge)}
        >
          <div
            className="flex flex-col max-h-[70vh] bg-card/95 backdrop-blur shadow-2xl rounded-r-xl overflow-hidden"
            style={{ width: `${activePanelW}px` }}
          >
            {/* Header Dock trigger */}
            <div className="flex shrink-0 items-center justify-between border-b border-border bg-accent/40 px-3 py-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Floating Insights
              </span>
              <button
                type="button"
                onClick={() => setDockedEdge('bottom')}
                className="rounded border border-border/80 bg-background px-1.5 py-0.5 text-[9px] font-medium text-foreground hover:bg-accent"
              >
                Dock Bottom
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              {panel}
            </div>
          </div>
        </DraggablePanel>
      ) : null}
    </div>
  );
}
