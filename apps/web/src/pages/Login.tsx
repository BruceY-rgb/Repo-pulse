import { zodResolver } from '@hookform/resolvers/zod';
import { CircleHelp, Github } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  useGithubOAuthConfigMutation,
  useGithubOAuthLogin,
  useLoginMutation,
} from '@/hooks/queries/use-auth-queries';
import { useLanguage } from '@/contexts/LanguageContext';
import type { ApiClientError } from '@/lib/query-hooks';

interface LoginFormValues {
  email: string;
  password: string;
}

export function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useLanguage();
  const loginWithGithub = useGithubOAuthLogin();
  const loginMutation = useLoginMutation();
  const oauthConfigMutation = useGithubOAuthConfigMutation();
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');

  const loginSchema = useMemo(
    () =>
      z.object({
        email: z.email(t('auth.login.form.error.invalidEmail')),
        password: z.string().min(6, t('auth.login.form.error.passwordMin')),
      }),
    [t],
  );

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const oauthError = searchParams.get('error') === 'oauth_failed';

  const onSubmit = async (values: LoginFormValues) => {
    try {
      await loginMutation.mutateAsync(values);
      navigate('/dashboard', { replace: true });
    } catch {
      // Form-level error is rendered below.
    }
  };

  const onSaveGithubOAuthConfig = async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      return;
    }
    await oauthConfigMutation.mutateAsync({
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
    });
  };

  const loginErrorMessage = getLoginErrorMessage(loginMutation.error, t);
  const oauthConfigErrorMessage = getOAuthConfigErrorMessage(oauthConfigMutation.error, t);
  const oauthConfigSuccessMessage = oauthConfigMutation.isSuccess
    ? t('auth.login.oauthConfig.success')
    : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md rounded-xl border-border bg-card">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <img src="/avator.png" alt={t('auth.login.logoAlt')} className="h-9 w-9 rounded-full" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
              {t('auth.login.title')}
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              {t('auth.login.description')}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-3 rounded-lg border border-border/80 bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground">{t('auth.login.oauthConfig.title')}</p>
              <Dialog>
                <DialogTrigger asChild>
                  <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs">
                    <CircleHelp className="h-4 w-4" />
                    {t('auth.login.oauthConfig.helpButton')}
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>{t('auth.login.oauthConfig.helpTitle')}</DialogTitle>
                    <DialogDescription>{t('auth.login.oauthConfig.helpDescription')}</DialogDescription>
                  </DialogHeader>
                  <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                    <li>{t('auth.login.oauthConfig.step1')}</li>
                    <li>{t('auth.login.oauthConfig.step2')}</li>
                    <li>{t('auth.login.oauthConfig.step3')}</li>
                    <li>{t('auth.login.oauthConfig.step4')}</li>
                  </ol>
                  <p className="text-xs text-muted-foreground">
                    {t('auth.login.oauthConfig.callbackHint')}
                    <span className="ml-1 font-mono text-foreground">http://localhost:3001/auth/github/callback</span>
                  </p>
                  <a
                    href="https://github.com/settings/apps/new"
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {t('auth.login.oauthConfig.openGithub')}
                  </a>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid gap-2">
              <Input
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                placeholder={t('auth.login.oauthConfig.clientIdPlaceholder')}
                autoComplete="off"
              />
              <Input
                value={clientSecret}
                onChange={(event) => setClientSecret(event.target.value)}
                placeholder={t('auth.login.oauthConfig.clientSecretPlaceholder')}
                type="password"
                autoComplete="off"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={onSaveGithubOAuthConfig}
                disabled={
                  oauthConfigMutation.isPending || !clientId.trim() || !clientSecret.trim()
                }
              >
                {oauthConfigMutation.isPending
                  ? t('auth.login.oauthConfig.saving')
                  : t('auth.login.oauthConfig.save')}
              </Button>
            </div>

            {(oauthConfigErrorMessage || oauthConfigSuccessMessage) && (
              <p className="text-xs text-muted-foreground">
                {oauthConfigErrorMessage || oauthConfigSuccessMessage}
              </p>
            )}
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('auth.login.form.email')}</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        autoComplete="email"
                        placeholder={t('auth.login.form.emailPlaceholder')}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('auth.login.form.password')}</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="current-password"
                        placeholder={t('auth.login.form.passwordPlaceholder')}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {(oauthError || loginErrorMessage) && (
                <p className="text-sm text-destructive">
                  {oauthError ? t('auth.login.form.error.oauthFailed') : loginErrorMessage}
                </p>
              )}

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending
                  ? t('auth.login.form.submitting')
                  : t('auth.login.form.submit')}
              </Button>
            </form>
          </Form>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">{t('auth.login.form.or')}</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <Button
            type="button"
            onClick={loginWithGithub}
            className="w-full gap-2"
            size="lg"
          >
            <Github className="h-4 w-4" />
            {t('auth.login.github')}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            {t('auth.login.notice')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function getOAuthConfigErrorMessage(
  error: ApiClientError | null,
  t: (key: string) => string,
): string | null {
  if (!error) {
    return null;
  }

  if (error.statusCode === 401 || error.statusCode === 400) {
    return t('auth.login.oauthConfig.error.invalidInput');
  }

  if (typeof error.statusCode === 'number' && error.statusCode >= 500) {
    return t('auth.login.oauthConfig.error.server');
  }

  if (error.statusCode === undefined) {
    return t('auth.login.oauthConfig.error.network');
  }

  return error.message || t('auth.login.oauthConfig.error.generic');
}

function getLoginErrorMessage(
  error: ApiClientError | null,
  t: (key: string) => string,
): string | null {
  if (!error) {
    return null;
  }

  if (error.statusCode === 401) {
    return t('auth.login.form.error.invalidCredentials');
  }

  if (typeof error.statusCode === 'number' && error.statusCode >= 500) {
    return t('auth.login.form.error.server');
  }

  if (error.statusCode === undefined) {
    return t('auth.login.form.error.network');
  }

  return error.message || t('auth.login.form.error.generic');
}
