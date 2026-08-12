import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { DesktopWorkbench } from '@/pages/DesktopWorkbench';

function App() {
  return (
    <HashRouter>
      <div className="desktop-shell">
        <div className="desktop-window-drag-strip" aria-hidden="true" />
        <Routes>
          <Route path="/" element={<Navigate to="/workbench" replace />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/workbench" element={<DesktopWorkbench />} />
            <Route path="/workbench/:view" element={<DesktopWorkbench />} />
            <Route path="/workbench/repository/:repositoryId" element={<DesktopWorkbench />} />
          </Route>

          <Route path="*" element={<Navigate to="/workbench" replace />} />
        </Routes>
        <Toaster theme="dark" position="top-right" richColors />
      </div>
    </HashRouter>
  );
}

export default App;
