import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useLanguage } from '@/contexts/LanguageContext';
import { CheckCircle2, Rocket, Package, ArrowRight, Monitor } from 'lucide-react';

interface SectionProps {
  activeSubsection: string;
}

export function QuickStartSection({ activeSubsection }: SectionProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-10">
      {/* Hero */}
      <section className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">{t('guide.quickStart.title')}</h1>
        <p className="text-lg text-muted-foreground">{t('guide.quickStart.subtitle')}</p>
      </section>

      <Separator />

      {/* Installation */}
      <section id="installation" className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold">{t('guide.quickStart.installation.title')}</h2>
          <p className="text-muted-foreground">{t('guide.quickStart.installation.desc')}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('guide.quickStart.installation.requirements')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {(['req1', 'req2', 'req3', 'req4'] as const).map((key) => (
                <li key={key} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                  <span>{t(`guide.quickStart.installation.${key}`)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Quick Start (dev mode) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Rocket className="h-4 w-4 text-primary" />
              {t('guide.quickStart.installation.quickStart')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Badge variant="outline" className="mt-0.5 shrink-0">1</Badge>
                <div>
                  <p className="text-sm font-medium">{t('guide.quickStart.installation.quickStartStep1')}</p>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">git clone https://github.com/BruceY-rgb/Repo-Pulse.git</code>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Badge variant="outline" className="mt-0.5 shrink-0">2</Badge>
                <div>
                  <p className="text-sm font-medium">{t('guide.quickStart.installation.quickStartStep2')}</p>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">pnpm install</code>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Badge variant="outline" className="mt-0.5 shrink-0">3</Badge>
                <div>
                  <p className="text-sm font-medium">{t('guide.quickStart.installation.quickStartStep3')}</p>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">cp .env.example .env</code>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Badge variant="outline" className="mt-0.5 shrink-0">4</Badge>
                <div>
                  <p className="text-sm font-medium">{t('guide.quickStart.installation.quickStartStep4')}</p>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">pnpm dev:electron</code>
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
              <Monitor className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">{t('guide.quickStart.installation.quickStartNote')}</p>
            </div>
          </CardContent>
        </Card>

        {/* Build Standalone App */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-4 w-4 text-primary" />
              {t('guide.quickStart.installation.buildApp')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{t('guide.quickStart.installation.buildAppDesc')}</p>
            <div className="space-y-3">
              {(['buildAppStep1', 'buildAppStep2', 'buildAppStep3'] as const).map((key, i) => (
                <div key={key} className="flex items-start gap-3">
                  <Badge variant="outline" className="mt-0.5 shrink-0">{i + 1}</Badge>
                  <p className="text-sm">{t(`guide.quickStart.installation.${key}`)}</p>
                </div>
              ))}
            </div>
            <div className="rounded-lg bg-muted/50 p-3 space-y-1">
              <code className="block text-xs">pnpm build:electron</code>
              <code className="block text-xs text-muted-foreground"># Builds Electron main/preload + web assets</code>
              <code className="block text-xs">pnpm package:electron</code>
              <code className="block text-xs text-muted-foreground"># Produces platform installer via electron-builder</code>
            </div>
          </CardContent>
        </Card>

      </section>

      <Separator />

      {/* First Launch */}
      <section id="first-steps" className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold">{t('guide.quickStart.firstSteps.title')}</h2>
          <p className="text-muted-foreground">{t('guide.quickStart.firstSteps.desc')}</p>
        </div>

        <div className="space-y-4">
          {(['step1', 'step2', 'step3', 'step4'] as const).map((key, i) => (
            <Card key={key}>
              <CardContent className="flex items-start gap-4 pt-6">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold">
                  {i + 1}
                </div>
                <div className="space-y-1">
                  <h3 className="font-semibold">{t(`guide.quickStart.firstSteps.${key}`)}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t(`guide.quickStart.firstSteps.${key}Desc`)}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Next steps hint */}
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-4">
        <ArrowRight className="h-4 w-4 text-primary shrink-0" />
        <p className="text-sm text-muted-foreground">
          {t('guide.quickStart.firstSteps.desc')}
        </p>
      </div>
    </div>
  );
}
