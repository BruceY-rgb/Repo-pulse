import { Navigate, Outlet } from 'react-router-dom';
import { Spinner } from '@/components/ui/spinner';
import { useCurrentUserQuery } from '@/hooks/queries/use-auth-queries';
import { setActiveAccountId } from '@/lib/account-storage';

export function ProtectedRoute() {
  const { data: user, isLoading } = useCurrentUserQuery();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="flex w-full max-w-sm items-center justify-center rounded-xl border border-border bg-card p-8">
          <Spinner className="h-6 w-6 text-primary" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // 在渲染受保护内容前同步登记当前账号 id：冷启动（已有会话、未走登录流程）时，
  // 子组件的 localStorage 懒初始化需要在首帧就拿到正确的账号命名空间。
  setActiveAccountId(user.id);

  return <Outlet />;
}
