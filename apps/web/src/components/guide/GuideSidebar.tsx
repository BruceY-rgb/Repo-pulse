import { useState } from 'react';
import {
  Rocket,
  GitBranch,
  Settings,
  HelpCircle,
  ChevronRight,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';

interface GuideNavChild {
  id: string;
  label: string;
}

interface GuideNavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  children: GuideNavChild[];
}

interface GuideSidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function GuideSidebar({
  activeSection,
  onSectionChange,
  isOpen,
  onClose,
}: GuideSidebarProps) {
  const { t } = useLanguage();

  const navItems: GuideNavItem[] = [
    {
      id: 'quick-start',
      label: t('guide.nav.quickStart'),
      icon: Rocket,
      children: [
        { id: 'installation', label: t('guide.nav.installation') },
        { id: 'first-steps', label: t('guide.nav.firstSteps') },
      ],
    },
    {
      id: 'core-workflows',
      label: t('guide.nav.coreWorkflows'),
      icon: GitBranch,
      children: [
        { id: 'workbench', label: t('guide.nav.workbench') },
        { id: 'repo-sessions', label: t('guide.nav.repoSessions') },
        { id: 'watch-feed', label: t('guide.nav.watchFeed') },
        { id: 'agent', label: t('guide.nav.agent') },
        { id: 'approvals', label: t('guide.nav.approvals') },
      ],
    },
    {
      id: 'configuration',
      label: t('guide.nav.configuration'),
      icon: Settings,
      children: [
        { id: 'settings', label: t('guide.nav.settings') },
        { id: 'integrations', label: t('guide.nav.integrations') },
        { id: 'ai-provider', label: t('guide.nav.aiProvider') },
      ],
    },
    {
      id: 'faq',
      label: t('guide.nav.faq'),
      icon: HelpCircle,
      children: [
        { id: 'common-issues', label: t('guide.nav.commonIssues') },
        { id: 'troubleshooting', label: t('guide.nav.troubleshooting') },
      ],
    },
  ];

  const [expandedItems, setExpandedItems] = useState<Set<string>>(
    new Set(navItems.map((item) => item.id)),
  );

  const toggleExpand = (id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const isActive = (id: string) => activeSection === id;
  const isParentActive = (item: GuideNavItem) => {
    if (isActive(item.id)) return true;
    return item.children.some((child) => isActive(child.id));
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-4 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">
          {t('guide.pageTitle')}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1 scrollbar-thin">
        <nav className="p-3 space-y-1">
          {navItems.map((item) => (
            <div key={item.id}>
              <button
                onClick={() => {
                  toggleExpand(item.id);
                  onSectionChange(item.id);
                }}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                  isParentActive(item)
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">{item.label}</span>
                <ChevronRight
                  className={cn(
                    'h-3 w-3 shrink-0 transition-transform',
                    expandedItems.has(item.id) && 'rotate-90',
                  )}
                />
              </button>
              {expandedItems.has(item.id) && (
                <div className="ml-4 pl-4 border-l border-border mt-1 space-y-1">
                  {item.children.map((child) => (
                    <button
                      key={child.id}
                      onClick={() => onSectionChange(child.id)}
                      className={cn(
                        'block w-full rounded-md px-3 py-1.5 text-left text-sm transition-colors',
                        isActive(child.id)
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      {child.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
      </ScrollArea>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed top-14 bottom-0 w-72 flex-col border-r border-border bg-background z-40">
        {sidebar}
      </aside>

      {/* Mobile overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={onClose}
          />
          <aside className="fixed top-0 bottom-0 left-0 w-72 flex-col border-r border-border bg-background z-50 animate-in slide-in-from-left">
            {sidebar}
          </aside>
        </div>
      )}
    </>
  );
}
