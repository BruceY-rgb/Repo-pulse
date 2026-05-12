import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { useLanguage } from '@/contexts/LanguageContext';
import { authService } from '@/services/auth.service';
import { authQueryKeys } from '@/hooks/queries/use-auth-queries';

export function AuthCallback() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  useEffect(() => {
    let isCancelled = false;

    const resolveCurrentUser = async () => {
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        try {
          const user = await authService.getMe();

          if (isCancelled) {
            return;
          }

          queryClient.setQueryData(authQueryKeys.currentUser(), user);
          navigate('/dashboard', { replace: true });
          return;
        } catch (error) {
          if (isCancelled) {
            return;
          }

          const status = (error as { response?: { status?: number } }).response?.status;
          if (status === 401 || attempt === 5) {
            navigate('/login?error=oauth_failed', { replace: true });
            return;
          }

          await new Promise((resolve) => {
            window.setTimeout(resolve, 600);
          });
        }
      }
    };

    void resolveCurrentUser();

    return () => {
      isCancelled = true;
    };
  }, [navigate, queryClient]);

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
