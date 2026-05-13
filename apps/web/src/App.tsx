import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AgentRoom } from '@/components/ui-custom/slack-layout/AgentRoom';
import { SlackLayout } from '@/components/ui-custom/slack-layout/SlackLayout';
import { KBarSearchProvider } from '@/components/ui-custom/kbar/KBarSearchProvider';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { Dashboard } from '@/pages/Dashboard';
import { Repositories } from '@/pages/Repositories';
import { AIAnalysis } from '@/pages/AIAnalysis';
import { Notifications } from '@/pages/Notifications';
import { Reports } from '@/pages/Reports';
import { Settings } from '@/pages/Settings';
import { Approvals } from '@/pages/Approvals';
import { FeedPlaceholder } from '@/pages/FeedPlaceholder';
import { Landing } from '@/pages/Landing';
import { Login } from '@/pages/Login';
import { AuthCallback } from '@/pages/AuthCallback';

function App() {
  return (
    <BrowserRouter>
      <KBarSearchProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/chats" replace />} />
          <Route path="/landing" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<SlackLayout />}>
              <Route path="/chats" element={<Dashboard />} />
              <Route path="/chats/:conversationId" element={<AgentRoom />} />
              <Route path="/feed" element={<FeedPlaceholder />} />
              <Route path="/discover" element={<Repositories />} />
              <Route path="/inbox" element={<Navigate to="/inbox/approvals" replace />} />
              <Route path="/inbox/approvals" element={<Approvals />} />
              <Route path="/inbox/notifications" element={<Notifications />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/analysis" element={<AIAnalysis />} />
              {/* Backward-compatible redirects */}
              <Route path="/dashboard" element={<Navigate to="/chats" replace />} />
              <Route path="/repositories" element={<Navigate to="/discover" replace />} />
              <Route path="/notifications" element={<Navigate to="/inbox/notifications" replace />} />
              <Route path="/approvals" element={<Navigate to="/inbox/approvals" replace />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/chats" replace />} />
        </Routes>
        <Toaster theme="light" position="top-right" richColors />
      </KBarSearchProvider>
    </BrowserRouter>
  );
}

export default App;
