import { useRef, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface DraggablePanelProps {
  x: number;
  y: number;
  onChange: (x: number, y: number) => void;
  minX?: number;
  minY?: number;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDock?: (edge: 'top' | 'left' | 'right' | 'bottom') => void;
  onPreview?: (edge: 'top' | 'left' | 'right' | 'bottom' | null) => void;
  children: ReactNode;
  className?: string;
}

export function DraggablePanel({
  x,
  y,
  onChange,
  minX = 8,
  minY = 8,
  onDragStart,
  onDragEnd,
  onDock,
  onPreview,
  children,
  className,
}: DraggablePanelProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panelX: 0, panelY: 0 });

  const clampPosition = (posX: number, posY: number) => {
    if (!panelRef.current) return { clampedX: posX, clampedY: posY };
    const rect = panelRef.current.getBoundingClientRect();
    const maxX = Math.max(minX, window.innerWidth - rect.width - 8);
    const maxY = Math.max(minY, window.innerHeight - rect.height - 8);
    return {
      clampedX: Math.max(minX, Math.min(posX, maxX)),
      clampedY: Math.max(minY, Math.min(posY, maxY)),
    };
  };

  const getDockEdge = (posX: number, posY: number) => {
    if (!panelRef.current) return null;
    const rect = panelRef.current.getBoundingClientRect();
    const threshold = 40;
    const distLeft = posX;
    const distRight = window.innerWidth - (posX + rect.width);
    const distTop = posY;
    const distBottom = window.innerHeight - (posY + rect.height);
    const minDist = Math.min(distLeft, distRight, distTop, distBottom);

    if (minDist > threshold) return null;

    if (minDist === distLeft) return 'left';
    if (minDist === distRight) return 'right';
    if (minDist === distTop) return 'top';
    return 'bottom';
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // Only drag with left click
    if (event.button !== 0) return;
    setIsDragging(true);
    dragStart.current = {
      x: event.clientX,
      y: event.clientY,
      panelX: x,
      panelY: y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    onDragStart?.();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const dx = event.clientX - dragStart.current.x;
    const dy = event.clientY - dragStart.current.y;
    const nextX = dragStart.current.panelX + dx;
    const nextY = dragStart.current.panelY + dy;

    onChange(nextX, nextY);

    const edge = getDockEdge(nextX, nextY);
    onPreview?.(edge);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);

    const { clampedX, clampedY } = clampPosition(x, y);
    onChange(clampedX, clampedY);

    const edge = getDockEdge(clampedX, clampedY);
    if (edge) {
      onDock?.(edge);
    }
    onPreview?.(null);
    onDragEnd?.();
  };

  // Adjust position when window resizes
  useEffect(() => {
    const handleResize = () => {
      if (isDragging) return;
      const { clampedX, clampedY } = clampPosition(x, y);
      if (clampedX !== x || clampedY !== y) {
        onChange(clampedX, clampedY);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [x, y, isDragging, onChange]);

  return (
    <div
      ref={panelRef}
      style={{
        left: `${x}px`,
        top: `${y}px`,
        position: 'fixed',
        zIndex: 40,
      }}
      className={cn(
        'flex flex-col rounded-xl border border-border/80 bg-popover shadow-2xl backdrop-blur-md transition-shadow',
        isDragging && 'shadow-indigo-500/10 cursor-grabbing',
        className,
      )}
    >
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="absolute left-0 top-0 bottom-0 w-6 cursor-grab active:cursor-grabbing flex flex-col items-center justify-center gap-1 z-50 hover:bg-white/5 transition-colors rounded-l-xl"
        aria-label="Drag panel"
      >
        <div className="w-0.5 h-5 bg-muted-foreground/60 rounded-full" />
        <div className="w-0.5 h-5 bg-muted-foreground/60 rounded-full" />
      </div>
      <div className="pl-6 h-full min-h-0 flex-1 flex flex-col">
        {children}
      </div>
    </div>
  );
}
