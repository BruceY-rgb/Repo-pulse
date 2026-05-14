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
  useDevGithubSessionMutation,
  useGithubOAuthConfigMutation,
  useGithubOAuthRuntimeConfigQuery,
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
  const devGithubSessionMutation = useDevGithubSessionMutation();
  const oauthConfigMutation = useGithubOAuthConfigMutation();
  const oauthRuntimeConfigQuery = useGithubOAuthRuntimeConfigQuery();
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [githubConfigHint, setGithubConfigHint] = useState<string | null>(null);
  const callbackUrl =
    oauthRuntimeConfigQuery.data?.callbackUrl ||
    'http://localhost:3001/auth/github/callback';
  const devBypassEnabled = oauthRuntimeConfigQuery.data?.devBypassEnabled ?? false;

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
  const oauthErrorReason = searchParams.get('reason');

  const onSubmit = async (values: LoginFormValues) => {
    try {
      await loginMutation.mutateAsync(values);
      navigate('/dashboard', { replace: true });
    } catch {
      // Form-level error is rendered below.
    }
  };

  const onSaveGithubOAuthConfig = async () => {
    const nextClientId = clientId.trim();
    const nextClientSecret = clientSecret.trim();
    if (!nextClientId || !nextClientSecret) {
      setGithubConfigHint(t('auth.login.oauthConfig.error.invalidInput'));
      return;
    }

    setGithubConfigHint(null);
    await oauthConfigMutation.mutateAsync({
      clientId: nextClientId,
      clientSecret: nextClientSecret,
    });
  };

  const onGithubLogin = async () => {
    const nextClientId = clientId.trim();
    const nextClientSecret = clientSecret.trim();

    setGithubConfigHint(null);

    if (nextClientId || nextClientSecret) {
      if (!nextClientId || !nextClientSecret) {
        setGithubConfigHint(t('auth.login.oauthConfig.error.invalidInput'));
        return;
      }

      await oauthConfigMutation.mutateAsync({
        clientId: nextClientId,
        clientSecret: nextClientSecret,
      });
    }

    try {
      await loginWithGithub();
    } catch {
      setGithubConfigHint(t('auth.login.form.error.oauthFailed'));
    }
  };

  const onDevGithubSessionLogin = async () => {
    setGithubConfigHint(null);

    try {
      await devGithubSessionMutation.mutateAsync(undefined);
    } catch {
      // Mutation error is rendered below.
    }
  };

  const loginErrorMessage = getLoginErrorMessage(loginMutation.error, t);
  const oauthConfigErrorMessage = getOAuthConfigErrorMessage(oauthConfigMutation.error, t);
  const devGithubSessionErrorMessage = getDevGithubSessionErrorMessage(
    devGithubSessionMutation.error,
  );
  const oauthConfigSuccessMessage = oauthConfigMutation.isSuccess
    ? t('auth.login.oauthConfig.success')
    : null;
  const oauthRuntimeConfigError = oauthRuntimeConfigQuery.isError
    ? t('auth.login.oauthConfig.error.network')
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
                    <span className="ml-1 font-mono text-foreground">{callbackUrl}</span>
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
                onChange={(event) => {
                  setGithubConfigHint(null);
                  setClientId(event.target.value);
                }}
                placeholder={t('auth.login.oauthConfig.clientIdPlaceholder')}
                autoComplete="off"
              />
              <Input
                value={clientSecret}
                onChange={(event) => {
                  setGithubConfigHint(null);
                  setClientSecret(event.target.value);
                }}
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

            <p className="text-xs text-muted-foreground">
              {t('auth.login.oauthConfig.callbackHint')}
              <span className="ml-1 font-mono text-foreground">{callbackUrl}</span>
            </p>
            {(githubConfigHint || oauthConfigErrorMessage || oauthConfigSuccessMessage) && (
              <p className="text-xs text-muted-foreground">
                {githubConfigHint || oauthConfigErrorMessage || oauthConfigSuccessMessage}
              </p>
            )}
            {oauthRuntimeConfigError && (
              <p className="text-xs text-muted-foreground">{oauthRuntimeConfigError}</p>
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
                  {oauthError
                    ? getOAuthFailureMessage(oauthErrorReason, t)
                    : loginErrorMessage}
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
            onClick={onGithubLogin}
            className="w-full gap-2"
            size="lg"
            disabled={oauthConfigMutation.isPending || devGithubSessionMutation.isPending}
          >
            <Github className="h-4 w-4" />
            {t('auth.login.github')}
          </Button>

          {devBypassEnabled ? (
            <div className="space-y-2">
              <Button
                type="button"
                onClick={onDevGithubSessionLogin}
                className="w-full gap-2"
                size="lg"
                variant="secondary"
                disabled={oauthConfigMutation.isPending || devGithubSessionMutation.isPending}
              >
                <Github className="h-4 w-4" />
                {devGithubSessionMutation.isPending
                  ? 'Connecting dev GitHub token...'
                  : 'Continue with Dev GitHub Token'}
              </Button>
              {devGithubSessionErrorMessage ? (
                <p className="text-sm text-destructive">{devGithubSessionErrorMessage}</p>
              ) : null}
            </div>
          ) : null}

          <p className="text-center text-xs text-muted-foreground">
            {t('auth.login.notice')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function getDevGithubSessionErrorMessage(error: ApiClientError | null): string | null {
  if (!error) {
    return null;
  }

  if (error.statusCode === 400) {
    return 'DEV_GITHUB_AUTH_BYPASS 已开启，但后端缺少 GITHUB_TOKEN。请在 .env 中配置后重启 API。';
  }

  if (error.statusCode === 401) {
    return '后端 GITHUB_TOKEN 无法通过 GitHub 校验，请检查 token 是否有效并具备必要权限。';
  }

  if (error.statusCode === 403) {
    return 'Dev GitHub Token 登录未启用。请设置 DEV_GITHUB_AUTH_BYPASS=1 并重启 API。';
  }

  if (error.statusCode === undefined) {
    return '无法连接 API，请确认后端服务已启动。';
  }

  return error.message || 'Dev GitHub Token 登录失败。';
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

function getOAuthFailureMessage(
  reason: string | null,
  t: (key: string) => string,
): string {
  switch (reason) {
    case 'incorrect_client_credentials':
    case 'invalid_client':
      return 'GitHub Client ID 或 Client Secret 不正确，请检查是否填写的是 GitHub OAuth App 凭据。';
    case 'bad_verification_code':
      return 'GitHub 授权码已失效，请重新发起一次登录。';
    case 'redirect_uri_mismatch':
      return 'GitHub OAuth 回调地址不匹配，请确认 GitHub App 中的 callback URL 与页面提示一致。';
    case 'github_token_timeout':
      return 'GitHub 已授权，但后端连接 GitHub 换取 access token 超时。请确认 API 进程可以访问 github.com，必要时为 API 配置 GITHUB_OAUTH_PROXY_URL 或 HTTPS_PROXY。';
    case 'github_network_unreachable':
      return 'GitHub 已授权，但后端无法连接 GitHub。请检查 API 进程网络、代理或 DNS 配置。';
    case 'session_unavailable':
      return 'GitHub 授权成功，但 Electron 没有拿到登录 Cookie。请重启 Electron 后重试，并确认 API_BASE_URL 与 GitHub callback 使用相同 host。';
    default:
      return t('auth.login.form.error.oauthFailed');
  }
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
