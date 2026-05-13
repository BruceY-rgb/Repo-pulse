import { Rss } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLanguage } from '@/contexts/LanguageContext';

export function FeedPlaceholder() {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      <Card className="max-w-md w-full text-center">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <Rss className="h-6 w-6 text-muted-foreground" />
            </div>
          </div>
          <CardTitle>{t('app.nav.feed')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {t('app.feed.empty')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
