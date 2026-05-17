import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Layout } from '@/components/ui-custom/Layout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Dashboard } from '@/pages/Dashboard';
import { Repositories } from '@/pages/Repositories';
import { AIAnalysis } from '@/pages/AIAnalysis';
import { Notifications } from '@/pages/Notifications';
import { Reports } from '@/pages/Reports';
import { Settings } from '@/pages/Settings';
import { Approvals } from '@/pages/Approvals';
import { Landing } from '@/pages/Landing';
import { Login } from '@/pages/Login';
import { AuthCallback } from '@/pages/AuthCallback';
import { isDesktopRuntime } from '@/lib/desktop';

function App() {
  const isDesktop = isDesktopRuntime();
  const Router = isDesktop && window.location.protocol === 'file:' ? HashRouter : BrowserRouter;
  const defaultRoute = isDesktop ? '/dashboard' : '/landing';

  return (
    <Router>
      <div className={isDesktop ? 'desktop-shell' : undefined}>
        {isDesktop ? <div className="desktop-window-drag-strip" aria-hidden="true" /> : null}
        <Routes>
          <Route path="/" element={<Navigate to={defaultRoute} replace />} />
          <Route path="/landing" element={isDesktop ? <Navigate to="/dashboard" replace /> : <Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/repositories" element={<Repositories />} />
              <Route path="/analysis" element={<AIAnalysis />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/approvals" element={<Approvals />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
        <Toaster theme="dark" position="top-right" richColors />
      </div>
    </Router>
  );
}

export default App;
