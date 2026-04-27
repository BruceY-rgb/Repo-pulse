import { Navigate, Outlet } from 'react-router-dom';
import { Spinner } from '@/components/ui/spinner';
import { useCurrentUserQuery } from '@/hooks/queries/use-auth-queries';

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

  return <Outlet />;
}
