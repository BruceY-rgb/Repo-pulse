import { zodResolver } from '@hookform/resolvers/zod';
import { ShieldCheck, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
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
  useBootstrapStatusQuery,
  useLoginMutation,
  useRegisterMutation,
} from '@/hooks/queries/use-auth-queries';
import { useLanguage } from '@/contexts/LanguageContext';
import type { ApiClientError } from '@/lib/query-hooks';

type AuthMode = 'login' | 'register';

interface AuthFormValues {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export function Login() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const loginMutation = useLoginMutation();
  const registerMutation = useRegisterMutation();
  const bootstrapStatusQuery = useBootstrapStatusQuery();
  const bootstrapRequired = bootstrapStatusQuery.data?.required ?? false;

  // 首次使用（本地实例还没有任何账号）默认进入注册模式
  const [modeOverride, setModeOverride] = useState<AuthMode | null>(null);
  const mode: AuthMode = modeOverride ?? (bootstrapRequired ? 'register' : 'login');
  const isRegister = mode === 'register';

  const formSchema = useMemo(
    () =>
      z
        .object({
          name: z.string(),
          email: z.email(t('auth.login.form.error.invalidEmail')),
          password: z.string().min(6, t('auth.login.form.error.passwordMin')),
          confirmPassword: z.string(),
        })
        .superRefine((values, ctx) => {
          // 姓名与确认密码仅在注册模式下校验
          if (!isRegister) {
            return;
          }
          if (!values.name.trim()) {
            ctx.addIssue({
              code: 'custom',
              path: ['name'],
              message: t('auth.login.form.error.nameRequired'),
            });
          }
          if (values.password !== values.confirmPassword) {
            ctx.addIssue({
              code: 'custom',
              path: ['confirmPassword'],
              message: t('auth.login.form.error.confirmPasswordMismatch'),
            });
          }
        }),
    [isRegister, t],
  );

  const form = useForm<AuthFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (values: AuthFormValues) => {
    try {
      if (isRegister) {
        await registerMutation.mutateAsync({
          email: values.email,
          name: values.name,
          password: values.password,
        });
      } else {
        await loginMutation.mutateAsync({
          email: values.email,
          password: values.password,
        });
      }
      navigate('/workbench', { replace: true });
    } catch {
      // Form-level error is rendered below.
    }
  };

  const switchMode = (next: AuthMode) => {
    setModeOverride(next);
    loginMutation.reset();
    registerMutation.reset();
    form.clearErrors();
    form.resetField('password');
    form.resetField('confirmPassword');
  };

  const submitErrorMessage = isRegister
    ? getRegisterErrorMessage(registerMutation.error, t)
    : getLoginErrorMessage(loginMutation.error, t);
  const submitting = loginMutation.isPending || registerMutation.isPending;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md rounded-xl border-border bg-card">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <img src="/desktop-logo.png" alt={t('auth.login.logoAlt')} className="h-9 w-9 rounded-full" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl font-bold tracking-tight text-foreground">
              {isRegister ? t('auth.login.registerTitle') : t('auth.login.title')}
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              {isRegister ? t('auth.login.registerDescription') : t('auth.login.description')}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {isRegister && (
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
                        autoComplete={isRegister ? 'new-password' : 'current-password'}
                        placeholder={t('auth.login.form.passwordPlaceholder')}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {isRegister && (
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('auth.login.form.confirmPassword')}</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          autoComplete="new-password"
                          placeholder={t('auth.login.form.confirmPasswordPlaceholder')}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {isRegister && bootstrapRequired && (
                <p className="text-xs text-muted-foreground">
                  {t('auth.login.bootstrapHint')}
                </p>
              )}

              {submitErrorMessage && (
                <p className="text-sm text-destructive">{submitErrorMessage}</p>
              )}

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={submitting || bootstrapStatusQuery.isLoading}
              >
                {isRegister ? <UserPlus className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                {submitting
                  ? isRegister
                    ? t('auth.login.form.registerSubmitting')
                    : t('auth.login.form.submitting')
                  : isRegister
                    ? t('auth.login.form.registerSubmit')
                    : t('auth.login.form.submit')}
              </Button>
            </form>
          </Form>

          {!bootstrapRequired && (
            <button
              type="button"
              className="w-full text-center text-sm text-primary hover:underline"
              onClick={() => switchMode(isRegister ? 'login' : 'register')}
            >
              {isRegister ? t('auth.login.switchToLogin') : t('auth.login.switchToRegister')}
            </button>
          )}

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

  return getCommonErrorMessage(error, t);
}

function getRegisterErrorMessage(
  error: ApiClientError | null,
  t: (key: string) => string,
): string | null {
  if (!error) {
    return null;
  }

  if (error.statusCode === 409) {
    return t('auth.login.form.error.emailTaken');
  }

  return getCommonErrorMessage(error, t);
}

function getCommonErrorMessage(
  error: ApiClientError,
  t: (key: string) => string,
): string {
  if (typeof error.statusCode === 'number' && error.statusCode >= 500) {
    return t('auth.login.form.error.server');
  }

  if (error.statusCode === undefined) {
    return t('auth.login.form.error.network');
  }

  return error.message || t('auth.login.form.error.generic');
}
