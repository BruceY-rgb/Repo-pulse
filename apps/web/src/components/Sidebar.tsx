import { useEffect, useRef } from 'react';
import { 
  Home, 
  Target, 
  Users, 
  Layers, 
  Cpu, 
  BarChart3, 
  FileText, 
  ChevronRight
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/contexts/LanguageContext';

interface SidebarProps {
  isOpen: boolean;
  activeSection: string;
  onSectionChange: (section: string) => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  children?: { id: string; label: string }[];
}

export function Sidebar({ isOpen, activeSection, onSectionChange }: SidebarProps) {
  const { t } = useLanguage();
  const scrollRef = useRef<HTMLDivElement>(null);

  const navItems: NavItem[] = [
    {
      id: 'overview',
      label: t('nav.overview') as string,
      icon: Home,
    },
    {
      id: 'requirements',
      label: t('nav.requirements') as string,
      icon: Target,
      children: [
        { id: 'user-personas', label: t('nav.userPersonas') as string },
        { id: 'pain-points', label: t('nav.painPoints') as string },
        { id: 'market-research', label: t('nav.marketResearch') as string },
      ],
    },
    {
      id: 'features',
      label: t('nav.features') as string,
      icon: Layers,
      children: [
        { id: 'data-listening', label: t('nav.dataListening') as string },
        { id: 'ai-analysis', label: t('nav.aiAnalysis') as string },
        { id: 'filtering', label: t('nav.filtering') as string },
        { id: 'approval', label: t('nav.approval') as string },
        { id: 'notification', label: t('nav.notification') as string },
        { id: 'dashboard', label: t('nav.dashboard') as string },
        { id: 'reporting', label: t('nav.reporting') as string },
        { id: 'comparison', label: t('nav.comparison') as string },
      ],
    },
    {
      id: 'architecture',
      label: t('nav.architecture') as string,
      icon: Cpu,
      children: [
        { id: 'system-design', label: t('nav.systemDesign') as string },
        { id: 'tech-stack', label: t('nav.techStack') as string },
        { id: 'data-flow', label: t('nav.dataFlow') as string },
      ],
    },
    {
      id: 'user-scenarios',
      label: t('nav.userScenarios') as string,
      icon: Users,
      children: [
        { id: 'personal-mode', label: t('nav.personalMode') as string },
        { id: 'team-mode', label: t('nav.teamMode') as string },
        { id: 'manager-mode', label: t('nav.managerMode') as string },
      ],
    },
    {
      id: 'roadmap',
      label: t('nav.roadmap') as string,
      icon: BarChart3,
    },
    {
      id: 'appendix',
      label: t('nav.appendix') as string,
      icon: FileText,
      children: [
        { id: 'glossary', label: t('nav.glossary') as string },
        { id: 'references', label: t('nav.references') as string },
      ],
    },
  ];

  useEffect(() => {
    // Scroll active item into view
    const activeElement = document.querySelector(`[data-section="${activeSection}"]`);
    if (activeElement && scrollRef.current) {
      activeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeSection]);

  if (!isOpen) return null;

  return (
    <aside className="fixed left-0 top-14 bottom-0 w-72 bg-background border-r border-border z-40">
      <ScrollArea className="h-full" ref={scrollRef}>
        <nav className="p-4 space-y-1">
          {navItems.map((item) => (
            <div key={item.id} className="space-y-1">
              <button
                data-section={item.id}
                onClick={() => onSectionChange(item.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  activeSection === item.id
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                )}
              >
                <item.icon className="h-4 w-4" />
                <span className="flex-1 text-left">{item.label}</span>
                {item.children && (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
              
              {item.children && (
                <div className="ml-4 pl-4 border-l border-border space-y-1">
                  {item.children.map((child) => (
                    <button
                      key={child.id}
                      data-section={child.id}
                      onClick={() => onSectionChange(child.id)}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors',
                        activeSection === child.id
                          ? 'bg-primary/10 text-primary'
                          : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <span className="flex-1 text-left">{child.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
      </ScrollArea>
    </aside>
  );
}
