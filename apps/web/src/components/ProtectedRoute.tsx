import { useEffect, useRef, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { Spinner } from '@/components/ui/spinner';
import { useCurrentUserQuery } from '@/hooks/queries/use-auth-queries';
import { authService } from '@/services/auth.service';
import { isDesktopRuntime } from '@/lib/desktop';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShieldCheck } from 'lucide-react';

function isUnauthorizedError(error: unknown) {
  return typeof error === 'object' && error !== null &&
    (error as { response?: { status?: number } }).response?.status === 401;
}

export function ProtectedRoute() {
  const { data: user, isLoading, refetch } = useCurrentUserQuery();
  const isDesktop = isDesktopRuntime();
  const startedRef = useRef(false);
  const [desktopState, setDesktopState] = useState<'idle' | 'starting' | 'locked' | 'error'>('idle');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isDesktop || isLoading || user || startedRef.current) return;
    startedRef.current = true;
    setDesktopState('starting');
    void authService.startDesktopSession().then(async (result) => {
      if (result.status === 'locked') {
        setDesktopState('locked');
        return;
      }
      const refreshed = await refetch();
      if (!refreshed.data) {
        throw new Error('本地会话已建立，但无法读取用户信息');
      }
      setDesktopState('idle');
    }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : '无法初始化本地工作空间');
      setDesktopState('error');
    });
  }, [isDesktop, isLoading, refetch, user]);

  const unlock = async () => {
    setError('');
    setDesktopState('starting');
    try {
      const result = await authService.startDesktopSession(password);
      if (result.status !== 'authenticated') {
        setDesktopState('locked');
        return;
      }
      setPassword('');
      const refreshed = await refetch();
      if (!refreshed.data) {
        throw new Error('解锁成功，但无法读取用户信息');
      }
      setDesktopState('idle');
    } catch (reason) {
      if (isUnauthorizedError(reason)) {
        setError('密码不正确，请重试');
        setDesktopState('locked');
      } else {
        setError(reason instanceof Error ? reason.message : '解锁后无法读取本地工作空间');
        setDesktopState('error');
      }
    }
  };

  const retry = () => {
    setError('');
    startedRef.current = false;
    setDesktopState('idle');
    void refetch();
  };

  if (isLoading || (isDesktop && !user && (desktopState === 'idle' || desktopState === 'starting'))) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="flex w-full max-w-sm items-center justify-center rounded-xl border border-border bg-card p-8">
          <Spinner className="h-6 w-6 text-primary" />
        </div>
      </div>
    );
  }

  if (isDesktop && !user && desktopState === 'locked') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <form
          className="w-full max-w-sm space-y-5 rounded-2xl border border-border bg-card p-7 shadow-2xl"
          onSubmit={(event) => { event.preventDefault(); void unlock(); }}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">解锁 Repo-Pulse</h1>
            <p className="mt-1 text-sm text-muted-foreground">此设备已启用启动验证。</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="desktop-unlock-password">应用锁密码</Label>
            <Input
              id="desktop-unlock-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoFocus
              minLength={6}
              required
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button className="w-full" type="submit" disabled={password.length < 6}>解锁</Button>
        </form>
      </div>
    );
  }

  if (isDesktop && !user && desktopState === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-destructive/30 bg-card p-7">
          <h1 className="text-lg font-semibold text-foreground">本地工作空间初始化失败</h1>
          <p className="text-sm text-muted-foreground">{error || '请确认本地 API 和数据库已正常启动。'}</p>
          <Button type="button" onClick={retry}>重试</Button>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
