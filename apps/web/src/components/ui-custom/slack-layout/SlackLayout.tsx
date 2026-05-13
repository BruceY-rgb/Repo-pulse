import { useState, useCallback } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Panel, Group, Separator } from 'react-resizable-panels';
import { TooltipProvider } from '@/components/ui/tooltip';
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
  const activeSection = getActiveSection(location.pathname);

  const handleCloseRightPanel = useCallback(() => {
    setRightPanelOpen(false);
  }, []);

  // Right panel opens on demand — for Phase 1, provide a way to toggle
  const handleOpenRightPanel = useCallback(() => {
    setRightPanelOpen(true);
  }, []);

  // Expose right panel toggle to child components via Outlet context
  // For Phase 1, we provide a simple way
  return (
    <TooltipProvider>
      <div className="flex h-screen overflow-hidden">
        <GlobalNav />
        <Group direction="horizontal" className="flex-1">
          {/* Middle panel: context-sensitive list */}
          <Panel defaultSize={17} minSize={12} maxSize={30} className="min-w-0">
            <MiddlePanel section={activeSection} className="h-full" />
          </Panel>
          <Separator className="w-1 bg-border hover:bg-primary/30 transition-colors active:bg-primary/50" />

          {/* Main content area */}
          <Panel defaultSize={rightPanelOpen ? 50 : 83} minSize={40} className="min-w-0 bg-background">
            <main className="h-full overflow-auto">
              <Outlet context={{ rightPanelOpen, onOpenRightPanel: handleOpenRightPanel }} />
            </main>
          </Panel>

          {/* Right panel handle (only visible when right panel is open) */}
          {rightPanelOpen && (
            <>
              <Separator className="w-1 bg-border hover:bg-primary/30 transition-colors active:bg-primary/50" />
              <Panel defaultSize={27} minSize={20} maxSize={45} className="min-w-0">
                <RightPanel
                  open={rightPanelOpen}
                  onClose={handleCloseRightPanel}
                  className="h-full"
                />
              </Panel>
            </>
          )}
        </Group>
      </div>
    </TooltipProvider>
  );
}
