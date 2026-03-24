import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Layout } from '@/components/ui-custom/Layout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Dashboard } from '@/pages/Dashboard';
import { Repositories } from '@/pages/Repositories';
import { AIAnalysis } from '@/pages/AIAnalysis';
import { Notifications } from '@/pages/Notifications';
import { Reports } from '@/pages/Reports';
import { Settings } from '@/pages/Settings';
import { Landing } from '@/pages/Landing';
import { Login } from '@/pages/Login';
import { AuthCallback } from '@/pages/AuthCallback';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* Protected routes */}
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/repositories" element={<Repositories />} />
            <Route path="/analysis" element={<AIAnalysis />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Route>
      </Routes>
      <Toaster theme="dark" position="top-right" richColors />
    </BrowserRouter>
  );
}

export default App;
