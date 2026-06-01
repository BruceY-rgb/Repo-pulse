import { useRef } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { cn } from '@/lib/utils';

interface ResizeHandleProps {
  orientation: 'horizontal' | 'vertical';
  onStart?: () => void;
  onMove: (delta: number) => void;
  onEnd?: () => void;
  className?: string;
}

export function ResizeHandle({
  orientation,
  onStart,
  onMove,
  onEnd,
  className,
}: ResizeHandleProps) {
  const isDragging = useRef(false);
  const startPos = useRef(0);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    isDragging.current = true;
    startPos.current = orientation === 'horizontal' ? event.clientY : event.clientX;
    event.currentTarget.setPointerCapture(event.pointerId);
    onStart?.();
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    const currentPos = orientation === 'horizontal' ? event.clientY : event.clientX;
    const delta = currentPos - startPos.current;
    startPos.current = currentPos;
    onMove(delta);
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
    onEnd?.();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      onMove(-10);
      onEnd?.();
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      onMove(10);
      onEnd?.();
    }
  };

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation={orientation}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onKeyDown={handleKeyDown}
      className={cn(
        'flex shrink-0 items-center justify-center bg-transparent transition-colors hover:bg-primary/20 focus:bg-primary focus:outline-none z-40',
        orientation === 'horizontal'
          ? 'h-3 w-full cursor-row-resize'
          : 'h-full w-3 cursor-col-resize',
        className,
      )}
    >
      {/* Six-dot drag handle */}
      {orientation === 'horizontal' ? (
        <svg
          width="24"
          height="7"
          viewBox="0 0 24 7"
          fill="none"
          className="text-muted-foreground/60"
        >
          <circle cx="5" cy="2" r="1.2" fill="currentColor" />
          <circle cx="12" cy="2" r="1.2" fill="currentColor" />
          <circle cx="19" cy="2" r="1.2" fill="currentColor" />
          <circle cx="5" cy="5" r="1.2" fill="currentColor" />
          <circle cx="12" cy="5" r="1.2" fill="currentColor" />
          <circle cx="19" cy="5" r="1.2" fill="currentColor" />
        </svg>
      ) : (
        <svg
          width="7"
          height="24"
          viewBox="0 0 7 24"
          fill="none"
          className="text-muted-foreground/60"
        >
          <circle cx="2" cy="5" r="1.2" fill="currentColor" />
          <circle cx="2" cy="12" r="1.2" fill="currentColor" />
          <circle cx="2" cy="19" r="1.2" fill="currentColor" />
          <circle cx="5" cy="5" r="1.2" fill="currentColor" />
          <circle cx="5" cy="12" r="1.2" fill="currentColor" />
          <circle cx="5" cy="19" r="1.2" fill="currentColor" />
        </svg>
      )}
    </div>
  );
}
