import { ScrollArea } from '@/components/ui/scroll-area';
import { OverviewSection } from './sections/OverviewSection';
import { RequirementsSection } from './sections/RequirementsSection';
import { FeaturesSection } from './sections/FeaturesSection';
import { ArchitectureSection } from './sections/ArchitectureSection';
import { UserScenariosSection } from './sections/UserScenariosSection';
import { RoadmapSection } from './sections/RoadmapSection';
import { AppendixSection } from './sections/AppendixSection';

interface ContentProps {
  activeSection: string;
}

export function Content({ activeSection }: ContentProps) {
  const renderSection = () => {
    switch (activeSection) {
      case 'overview':
        return <OverviewSection />;
      case 'requirements':
      case 'user-personas':
      case 'pain-points':
      case 'market-research':
        return <RequirementsSection activeSubsection={activeSection} />;
      case 'features':
      case 'data-listening':
      case 'ai-analysis':
      case 'filtering':
      case 'approval':
      case 'notification':
      case 'dashboard':
      case 'reporting':
      case 'comparison':
        return <FeaturesSection activeSubsection={activeSection} />;
      case 'architecture':
      case 'system-design':
      case 'tech-stack':
      case 'data-flow':
        return <ArchitectureSection activeSubsection={activeSection} />;
      case 'user-scenarios':
      case 'personal-mode':
      case 'team-mode':
      case 'manager-mode':
        return <UserScenariosSection activeSubsection={activeSection} />;
      case 'roadmap':
        return <RoadmapSection />;
      case 'appendix':
      case 'glossary':
      case 'references':
        return <AppendixSection activeSubsection={activeSection} />;
      default:
        return <OverviewSection />;
    }
  };

  return (
    <ScrollArea className="h-[calc(100vh-3.5rem)]">
      <div className="max-w-4xl mx-auto p-8">
        {renderSection()}
      </div>
    </ScrollArea>
  );
}
