import { BrowserRouter, HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Landing } from '@/pages/Landing';
import { Login } from '@/pages/Login';
import { AuthCallback } from '@/pages/AuthCallback';
import { ApiList } from '@/pages/ApiList';
import { DesktopWorkbench } from '@/pages/DesktopWorkbench';
import { isDesktopRuntime } from '@/lib/desktop';

function LegacyWorkbenchRedirect({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
}

function App() {
  const isDesktop = isDesktopRuntime();
  const Router = isDesktop ? HashRouter : BrowserRouter;
  const defaultRoute = isDesktop ? '/workbench' : '/landing';

  return (
    <Router>
      <div className={isDesktop ? 'desktop-shell' : undefined}>
        {isDesktop ? <div className="desktop-window-drag-strip" aria-hidden="true" /> : null}
        <Routes>
          <Route path="/" element={<Navigate to={defaultRoute} replace />} />
          <Route path="/landing" element={isDesktop ? <Navigate to="/workbench" replace /> : <Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/api-list" element={<ApiList />} />
          </Route>

          <Route element={<ProtectedRoute />}>
            <Route path="/workbench" element={<DesktopWorkbench />} />
            <Route path="/workbench/:view" element={<DesktopWorkbench />} />
            <Route path="/workbench/repository/:repositoryId" element={<DesktopWorkbench />} />
            <Route path="/dashboard" element={<LegacyWorkbenchRedirect to="/workbench/dashboard" />} />
            <Route path="/repositories" element={<LegacyWorkbenchRedirect to="/workbench/repositories" />} />
            <Route path="/reports" element={<LegacyWorkbenchRedirect to="/workbench/reports" />} />
            <Route path="/settings" element={<LegacyWorkbenchRedirect to="/workbench/settings" />} />
            <Route path="/analysis" element={<LegacyWorkbenchRedirect to="/workbench" />} />
            <Route path="/notifications" element={<LegacyWorkbenchRedirect to="/workbench" />} />
            <Route path="/approvals" element={<LegacyWorkbenchRedirect to="/workbench" />} />
          </Route>

          <Route path="*" element={<Navigate to={defaultRoute} replace />} />
        </Routes>
        <Toaster theme="dark" position="top-right" richColors />
      </div>
    </Router>
  );
}

export default App;
