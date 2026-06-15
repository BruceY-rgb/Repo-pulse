import { useState } from 'react';
import { Header } from '@/components/Header';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GuideSidebar } from '@/components/guide/GuideSidebar';
import { GuideContent } from '@/components/guide/GuideContent';

export function GuidePage() {
  const [activeSection, setActiveSection] = useState('quick-start');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Header
        onMenuClick={() => setSidebarOpen(true)}
        onSearchClick={() => {}}
        isSidebarOpen={sidebarOpen}
      />

      <div className="flex pt-14">
        <GuideSidebar
          activeSection={activeSection}
          onSectionChange={(section) => {
            setActiveSection(section);
            setSidebarOpen(false);
          }}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <main className="flex-1 lg:ml-72">
          <ScrollArea className="h-[calc(100vh-3.5rem)]">
            <GuideContent activeSection={activeSection} />
          </ScrollArea>
        </main>
      </div>
    </div>
  );
}
