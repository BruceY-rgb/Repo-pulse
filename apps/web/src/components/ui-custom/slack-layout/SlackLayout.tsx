import { useState, useCallback, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import type { PanelImperativeHandle, PanelSize } from 'react-resizable-panels';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { GlobalNav } from './GlobalNav';
import { MiddlePanel } from './MiddlePanel';
import { RightPanel } from './RightPanel';

function getActiveSection(pathname: string): string {
  if (pathname.startsWith('/chats')) return 'chats';
  if (pathname.startsWith('/feed')) return 'feed';
  if (pathname.startsWith('/discover')) return 'discover';
  if (pathname.startsWith('/inbox')) return 'inbox';
  if (pathname.startsWith('/reports')) return 'reports';
  if (pathname.startsWith('/settings')) return 'settings';
  if (pathname.startsWith('/analysis')) return 'chats';
  return 'chats';
}

export function SlackLayout() {
  const location = useLocation();
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [middlePanelCollapsed, setMiddlePanelCollapsed] = useState(false);
  const middlePanelRef = useRef<PanelImperativeHandle | null>(null);
  const activeSection = getActiveSection(location.pathname);

  const handleCloseRightPanel = useCallback(() => {
    setRightPanelOpen(false);
  }, []);

  // Right panel opens on demand — for Phase 1, provide a way to toggle
  const handleOpenRightPanel = useCallback(() => {
    setRightPanelOpen(true);
  }, []);

  const handleMiddlePanelResize = useCallback((size: PanelSize) => {
    setMiddlePanelCollapsed(size.inPixels < 96);
  }, []);

  const handleCollapseMiddlePanel = useCallback(() => {
    middlePanelRef.current?.collapse();
    setMiddlePanelCollapsed(true);
  }, []);

  const handleExpandMiddlePanel = useCallback(() => {
    middlePanelRef.current?.expand();
    setMiddlePanelCollapsed(false);
  }, []);

  // Expose right panel toggle to child components via Outlet context
  // For Phase 1, we provide a simple way
  return (
    <TooltipProvider>
      <div className="flex h-dvh w-screen overflow-hidden bg-background text-foreground">
        <GlobalNav />
        <ResizablePanelGroup orientation="horizontal" className="min-w-0 flex-1">
          {/* Middle panel: context-sensitive list */}
          <ResizablePanel
            id="middle-panel"
            panelRef={middlePanelRef}
            defaultSize={300}
            minSize={240}
            maxSize={380}
            collapsedSize={48}
            collapsible
            groupResizeBehavior="preserve-pixel-size"
            onResize={handleMiddlePanelResize}
            className="min-w-0"
          >
            <MiddlePanel
              section={activeSection}
              collapsed={middlePanelCollapsed}
              onCollapse={handleCollapseMiddlePanel}
              onExpand={handleExpandMiddlePanel}
              className="h-full"
            />
          </ResizablePanel>
          <ResizableHandle className="w-px bg-border transition-colors hover:bg-primary/50" />

          {/* Main content area */}
          <ResizablePanel
            id="main-panel"
            defaultSize="100%"
            minSize={360}
            className="min-w-0 bg-background"
          >
            <main className="h-full overflow-auto">
              <Outlet context={{ rightPanelOpen, onOpenRightPanel: handleOpenRightPanel }} />
            </main>
          </ResizablePanel>

          {/* Right panel handle (only visible when right panel is open) */}
          {rightPanelOpen && (
            <>
              <ResizableHandle className="w-px bg-border transition-colors hover:bg-primary/50" />
              <ResizablePanel
                id="right-panel"
                defaultSize={320}
                minSize={280}
                maxSize={520}
                groupResizeBehavior="preserve-pixel-size"
                className="min-w-0"
              >
                <RightPanel
                  open={rightPanelOpen}
                  onClose={handleCloseRightPanel}
                  className="h-full"
                />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
    </TooltipProvider>
  );
}
