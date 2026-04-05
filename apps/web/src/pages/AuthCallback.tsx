import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrentUserQuery } from '@/hooks/queries/use-auth-queries';
import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { useLanguage } from '@/contexts/LanguageContext';

export function AuthCallback() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { data: user, isLoading, isError } = useCurrentUserQuery();

  useEffect(() => {
    if (user) {
      navigate('/dashboard', { replace: true });
      return;
    }

    if (!isLoading && isError) {
      navigate('/login?error=oauth_failed', { replace: true });
    }
  }, [isError, isLoading, navigate, user]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md rounded-xl border-border bg-card">
        <CardContent className="space-y-4 p-6">
          <p className="text-base font-medium text-foreground">{t('auth.callback.title')}</p>
          <p className="text-sm text-muted-foreground">{t('auth.callback.description')}</p>
          <div className="flex items-center justify-center py-2">
            <Spinner className="h-6 w-6 text-primary" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
