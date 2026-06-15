import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useLanguage } from '@/contexts/LanguageContext';
import { User, GitBranch, BrainCircuit, Bell, Wrench } from 'lucide-react';

interface SectionProps {
  activeSubsection: string;
}

interface FaqGroup {
  id: string;
  titleKey: string;
  icon: React.ElementType;
  items: { qKey: string; aKey: string }[];
}

export function FAQSection({ activeSubsection }: SectionProps) {
  const { t } = useLanguage();

  const groups: FaqGroup[] = [
    {
      id: 'account',
      titleKey: 'guide.faq.account.title',
      icon: User,
      items: [
        { qKey: 'guide.faq.account.q1', aKey: 'guide.faq.account.a1' },
        { qKey: 'guide.faq.account.q2', aKey: 'guide.faq.account.a2' },
      ],
    },
    {
      id: 'repos',
      titleKey: 'guide.faq.repos.title',
      icon: GitBranch,
      items: [
        { qKey: 'guide.faq.repos.q1', aKey: 'guide.faq.repos.a1' },
        { qKey: 'guide.faq.repos.q2', aKey: 'guide.faq.repos.a2' },
        { qKey: 'guide.faq.repos.q3', aKey: 'guide.faq.repos.a3' },
      ],
    },
    {
      id: 'analysis',
      titleKey: 'guide.faq.analysis.title',
      icon: BrainCircuit,
      items: [
        { qKey: 'guide.faq.analysis.q1', aKey: 'guide.faq.analysis.a1' },
        { qKey: 'guide.faq.analysis.q2', aKey: 'guide.faq.analysis.a2' },
        { qKey: 'guide.faq.analysis.q3', aKey: 'guide.faq.analysis.a3' },
      ],
    },
    {
      id: 'notifications',
      titleKey: 'guide.faq.notifications.title',
      icon: Bell,
      items: [
        { qKey: 'guide.faq.notifications.q1', aKey: 'guide.faq.notifications.a1' },
        { qKey: 'guide.faq.notifications.q2', aKey: 'guide.faq.notifications.a2' },
      ],
    },
    {
      id: 'troubleshooting',
      titleKey: 'guide.faq.troubleshooting.title',
      icon: Wrench,
      items: [
        { qKey: 'guide.faq.troubleshooting.q1', aKey: 'guide.faq.troubleshooting.a1' },
        { qKey: 'guide.faq.troubleshooting.q2', aKey: 'guide.faq.troubleshooting.a2' },
      ],
    },
  ];

  const defaultValue = activeSubsection === 'troubleshooting' ? 'troubleshooting-0' : 'account-0';

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">{t('guide.faq.title')}</h1>
        <p className="text-lg text-muted-foreground">{t('guide.faq.subtitle')}</p>
      </section>

      <Separator />

      <div className="space-y-6">
        {groups.map((group) => (
          <Card key={group.id} id={group.id === 'troubleshooting' ? 'troubleshooting' : undefined}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <group.icon className="h-5 w-5 text-primary" />
                {t(group.titleKey)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible defaultValue={group.id === 'troubleshooting' && activeSubsection === 'troubleshooting' ? `${group.id}-0` : undefined}>
                {group.items.map((item, i) => (
                  <AccordionItem key={i} value={`${group.id}-${i}`}>
                    <AccordionTrigger className="text-sm text-left">
                      {t(item.qKey)}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                      {t(item.aKey)}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
