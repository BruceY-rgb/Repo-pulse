import { zodResolver } from '@hookform/resolvers/zod';
import { Mail, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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
  useBootstrapMutation,
  useBootstrapStatusQuery,
  useLoginMutation,
  useSendVerificationCodeMutation,
} from '@/hooks/queries/use-auth-queries';
import { useLanguage } from '@/contexts/LanguageContext';
import type { ApiClientError } from '@/lib/query-hooks';

interface LoginFormValues {
  name: string;
  email: string;
  password: string;
  verificationCode: string;
}

export function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useLanguage();
  const loginMutation = useLoginMutation();
  const bootstrapMutation = useBootstrapMutation();
  const sendCodeMutation = useSendVerificationCodeMutation();
  const bootstrapStatusQuery = useBootstrapStatusQuery();
  const [codeCooldown, setCodeCooldown] = useState(0);
  const bootstrapRequired = bootstrapStatusQuery.data?.required ?? false;

  const loginSchema = useMemo(
    () =>
      z.object({
        name: bootstrapRequired
          ? z.string().min(1, t('auth.login.form.error.nameRequired'))
          : z.string().optional().default(''),
        email: z.email(t('auth.login.form.error.invalidEmail')),
        password: z.string().min(6, t('auth.login.form.error.passwordMin')),
        verificationCode: z.string().length(6, t('auth.login.form.error.codeLength')),
      }),
    [bootstrapRequired, t],
  );

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      verificationCode: '',
    },
  });

  const oauthError = searchParams.get('error') === 'oauth_failed';
  const oauthErrorReason = searchParams.get('reason');

  const onSubmit = async (values: LoginFormValues) => {
    try {
      if (bootstrapRequired) {
        await bootstrapMutation.mutateAsync({
          email: values.email,
          name: values.name,
          password: values.password,
          verificationCode: values.verificationCode,
        });
      } else {
        await loginMutation.mutateAsync(values);
      }
      navigate('/workbench', { replace: true });
    } catch {
      // Form-level error is rendered below.
    }
  };

  const onSendVerificationCode = async () => {
    const emailIsValid = await form.trigger('email');
    if (!emailIsValid || codeCooldown > 0) {
      return;
    }

    try {
      await sendCodeMutation.mutateAsync({
        email: form.getValues('email'),
        purpose: bootstrapRequired ? 'BOOTSTRAP' : 'LOGIN',
      });
      setCodeCooldown(60);
    } catch {
      // Mutation error is rendered below.
    }
  };

  useEffect(() => {
    if (codeCooldown <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setCodeCooldown((current) => Math.max(current - 1, 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [codeCooldown]);

  const loginErrorMessage = getLoginErrorMessage(loginMutation.error, t);
  const bootstrapErrorMessage = getLoginErrorMessage(bootstrapMutation.error, t);
  const sendCodeErrorMessage = getVerificationCodeErrorMessage(sendCodeMutation.error, t);
  const submitErrorMessage = bootstrapRequired ? bootstrapErrorMessage : loginErrorMessage;
  const submitting = loginMutation.isPending || bootstrapMutation.isPending;
  const codeButtonDisabled =
    sendCodeMutation.isPending || codeCooldown > 0 || bootstrapStatusQuery.isLoading;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md rounded-xl border-border bg-card">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <img src="/desktop-logo.png" alt={t('auth.login.logoAlt')} className="h-9 w-9 rounded-full" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
              {bootstrapRequired ? t('auth.login.bootstrapTitle') : t('auth.login.title')}
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              {bootstrapRequired ? t('auth.login.bootstrapDescription') : t('auth.login.description')}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {bootstrapRequired && (
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('auth.login.form.name')}</FormLabel>
                      <FormControl>
                        <Input
                          autoComplete="name"
                          placeholder={t('auth.login.form.namePlaceholder')}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

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

              <FormField
                control={form.control}
                name="verificationCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('auth.login.form.verificationCode')}</FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          placeholder={t('auth.login.form.verificationCodePlaceholder')}
                          maxLength={6}
                          {...field}
                        />
                      </FormControl>
                      <Button
                        type="button"
                        variant="secondary"
                        className="min-w-28 gap-2"
                        onClick={onSendVerificationCode}
                        disabled={codeButtonDisabled}
                      >
                        <Mail className="h-4 w-4" />
                        {sendCodeMutation.isPending
                          ? t('auth.login.form.codeSending')
                          : codeCooldown > 0
                            ? `${codeCooldown}s`
                            : t('auth.login.form.sendCode')}
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {(oauthError || submitErrorMessage || sendCodeErrorMessage) && (
                <p className="text-sm text-destructive">
                  {oauthError
                    ? getOAuthFailureMessage(oauthErrorReason, t)
                    : submitErrorMessage || sendCodeErrorMessage}
                </p>
              )}

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={submitting || bootstrapStatusQuery.isLoading}
              >
                <ShieldCheck className="h-4 w-4" />
                {submitting
                  ? t('auth.login.form.submitting')
                  : bootstrapRequired
                    ? t('auth.login.form.bootstrapSubmit')
                    : t('auth.login.form.submit')}
              </Button>
            </form>
          </Form>

          <p className="text-center text-xs text-muted-foreground">
            {t('auth.login.notice')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
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

function getVerificationCodeErrorMessage(
  error: ApiClientError | null,
  t: (key: string) => string,
): string | null {
  if (!error) {
    return null;
  }

  if (error.statusCode === 400) {
    return t('auth.login.form.error.codeRecentlySent');
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
    default:
      return t('auth.login.form.error.oauthFailed');
  }
}
