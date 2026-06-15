import { QuickStartSection } from '@/components/guide/sections/QuickStartSection';
import { CoreWorkflowsSection } from '@/components/guide/sections/CoreWorkflowsSection';
import { ConfigurationSection } from '@/components/guide/sections/ConfigurationSection';
import { FAQSection } from '@/components/guide/sections/FAQSection';

interface GuideContentProps {
  activeSection: string;
}

export function GuideContent({ activeSection }: GuideContentProps) {
  // Map activeSection to root section for routing
  const rootSection = (() => {
    switch (activeSection) {
      case 'installation':
      case 'first-steps':
        return 'quick-start';
      case 'workbench':
      case 'repo-sessions':
      case 'watch-feed':
      case 'agent':
      case 'approvals':
        return 'core-workflows';
      case 'settings':
      case 'integrations':
      case 'ai-provider':
        return 'configuration';
      case 'common-issues':
      case 'troubleshooting':
        return 'faq';
      default:
        return activeSection;
    }
  })();

  const renderSection = () => {
    switch (rootSection) {
      case 'quick-start':
        return <QuickStartSection activeSubsection={activeSection} />;
      case 'core-workflows':
        return <CoreWorkflowsSection activeSubsection={activeSection} />;
      case 'configuration':
        return <ConfigurationSection activeSubsection={activeSection} />;
      case 'faq':
        return <FAQSection activeSubsection={activeSection} />;
      default:
        return <QuickStartSection activeSubsection="quick-start" />;
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {renderSection()}
    </div>
  );
}
