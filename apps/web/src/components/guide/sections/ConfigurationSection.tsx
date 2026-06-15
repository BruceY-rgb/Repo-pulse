import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useLanguage } from '@/contexts/LanguageContext';
import { UserCog, Plug, Cpu } from 'lucide-react';

interface SectionProps {
  activeSubsection: string;
}

export function ConfigurationSection({ activeSubsection }: SectionProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">{t('guide.configuration.title')}</h1>
        <p className="text-lg text-muted-foreground">{t('guide.configuration.subtitle')}</p>
      </section>

      <Separator />

      {/* Settings */}
      <section id="settings" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UserCog className="h-5 w-5 text-primary" />
              {t('guide.configuration.settings.title')}
            </CardTitle>
            <CardDescription>{t('guide.configuration.settings.desc')}</CardDescription>
          </CardHeader>
        </Card>
      </section>

      <Separator />

      {/* Integrations */}
      <section id="integrations" className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold">{t('guide.configuration.integrations.title')}</h2>
          <p className="text-muted-foreground">{t('guide.configuration.integrations.desc')}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                <span className="flex items-center gap-2">
                  <Plug className="h-4 w-4 text-primary" />
                  GitHub
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{t('guide.configuration.integrations.github')}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                <span className="flex items-center gap-2">
                  <Plug className="h-4 w-4 text-primary" />
                  Feishu
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{t('guide.configuration.integrations.feishu')}</p>
            </CardContent>
          </Card>
        </div>

      </section>

      <Separator />

      {/* AI Provider */}
      <section id="ai-provider" className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold">{t('guide.configuration.aiProvider.title')}</h2>
          <p className="text-muted-foreground">{t('guide.configuration.aiProvider.desc')}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Cpu className="h-5 w-5 text-primary" />
              {t('guide.configuration.aiProvider.title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{t('guide.configuration.aiProvider.supported')}</p>
            <p className="text-sm text-muted-foreground">{t('guide.configuration.aiProvider.config')}</p>
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">{t('guide.configuration.aiProvider.fallback')}</p>
            </div>
          </CardContent>
        </Card>

      </section>
    </div>
  );
}
