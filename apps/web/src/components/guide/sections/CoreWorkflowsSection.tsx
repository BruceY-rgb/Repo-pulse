import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Layout,
  MessageSquare,
  Rss,
  Bot,
  CheckCheck,
  Lightbulb,
} from 'lucide-react';

interface SectionProps {
  activeSubsection: string;
}

export function CoreWorkflowsSection({ activeSubsection }: SectionProps) {
  const { t } = useLanguage();

  const defaultTab = (() => {
    switch (activeSubsection) {
      case 'repo-sessions': return 'repo-sessions';
      case 'watch-feed': return 'watch-feed';
      case 'agent': return 'agent';
      case 'approvals': return 'approvals';
      default: return 'workbench';
    }
  })();

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">{t('guide.coreWorkflows.title')}</h1>
        <p className="text-lg text-muted-foreground">{t('guide.coreWorkflows.subtitle')}</p>
      </section>

      <Separator />

      <Tabs defaultValue={defaultTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="workbench" className="flex items-center gap-2">
            <Layout className="h-4 w-4" />
            <span className="hidden sm:inline">{t('guide.coreWorkflows.workbench.title')}</span>
          </TabsTrigger>
          <TabsTrigger value="repo-sessions" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">{t('guide.coreWorkflows.repoSessions.title')}</span>
          </TabsTrigger>
          <TabsTrigger value="watch-feed" className="flex items-center gap-2">
            <Rss className="h-4 w-4" />
            <span className="hidden sm:inline">{t('guide.coreWorkflows.watchFeed.title')}</span>
          </TabsTrigger>
          <TabsTrigger value="agent" className="flex items-center gap-2">
            <Bot className="h-4 w-4" />
            <span className="hidden sm:inline">{t('guide.coreWorkflows.agent.title')}</span>
          </TabsTrigger>
          <TabsTrigger value="approvals" className="flex items-center gap-2">
            <CheckCheck className="h-4 w-4" />
            <span className="hidden sm:inline">{t('guide.coreWorkflows.approvals.title')}</span>
          </TabsTrigger>
        </TabsList>

        {/* Today's Workbench */}
        <TabsContent value="workbench" className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold">{t('guide.coreWorkflows.workbench.title')}</h2>
            <p className="text-muted-foreground">{t('guide.coreWorkflows.workbench.desc')}</p>
          </div>
          <div className="space-y-3">
            {(['item1', 'item2', 'item3', 'item4'] as const).map((key, i) => (
              <div key={key} className="flex items-start gap-3">
                <Badge variant="secondary" className="mt-0.5 shrink-0">{i + 1}</Badge>
                <p className="text-sm">{t(`guide.coreWorkflows.workbench.${key}`)}</p>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Repository Sessions */}
        <TabsContent value="repo-sessions" className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold">{t('guide.coreWorkflows.repoSessions.title')}</h2>
            <p className="text-muted-foreground">{t('guide.coreWorkflows.repoSessions.desc')}</p>
          </div>
          <div className="space-y-3">
            {(['item1', 'item2', 'item3', 'item4'] as const).map((key, i) => (
              <div key={key} className="flex items-start gap-3">
                <Badge variant="secondary" className="mt-0.5 shrink-0">{i + 1}</Badge>
                <p className="text-sm">{t(`guide.coreWorkflows.repoSessions.${key}`)}</p>
              </div>
            ))}
          </div>
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="flex items-start gap-3 pt-6">
              <Lightbulb className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <p className="text-sm">{t('guide.coreWorkflows.repoSessions.tip')}</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Watch Feed */}
        <TabsContent value="watch-feed" className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold">{t('guide.coreWorkflows.watchFeed.title')}</h2>
            <p className="text-muted-foreground">{t('guide.coreWorkflows.watchFeed.desc')}</p>
          </div>
          <div className="space-y-3">
            {(['item1', 'item2', 'item3', 'item4'] as const).map((key, i) => (
              <div key={key} className="flex items-start gap-3">
                <Badge variant="secondary" className="mt-0.5 shrink-0">{i + 1}</Badge>
                <p className="text-sm">{t(`guide.coreWorkflows.watchFeed.${key}`)}</p>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* AI Agent */}
        <TabsContent value="agent" className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold">{t('guide.coreWorkflows.agent.title')}</h2>
            <p className="text-muted-foreground">{t('guide.coreWorkflows.agent.desc')}</p>
          </div>
          <div className="space-y-3">
            {(['item1', 'item2', 'item3', 'item4'] as const).map((key, i) => (
              <div key={key} className="flex items-start gap-3">
                <Badge variant="secondary" className="mt-0.5 shrink-0">{i + 1}</Badge>
                <p className="text-sm">{t(`guide.coreWorkflows.agent.${key}`)}</p>
              </div>
            ))}
          </div>
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="flex items-start gap-3 pt-6">
              <Lightbulb className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <p className="text-sm">{t('guide.coreWorkflows.agent.tip')}</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Approvals */}
        <TabsContent value="approvals" className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold">{t('guide.coreWorkflows.approvals.title')}</h2>
            <p className="text-muted-foreground">{t('guide.coreWorkflows.approvals.desc')}</p>
          </div>
          <div className="space-y-3">
            {(['item1', 'item2', 'item3', 'item4'] as const).map((key, i) => (
              <div key={key} className="flex items-start gap-3">
                <Badge variant="secondary" className="mt-0.5 shrink-0">{i + 1}</Badge>
                <p className="text-sm">{t(`guide.coreWorkflows.approvals.${key}`)}</p>
              </div>
            ))}
          </div>
          <Card className="border-border bg-muted/30">
            <CardContent className="flex items-start gap-3 pt-6">
              <Lightbulb className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground">{t('guide.coreWorkflows.approvals.note')}</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
