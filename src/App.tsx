import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AuthProvider, useAuthContext } from '@/contexts/AuthContext';
import { AppDataProvider } from '@/contexts/AppDataContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import Auth from '@/pages/Auth';
import Dashboard from '@/pages/Dashboard';
import Workouts from '@/pages/Workouts';
import Diet from '@/pages/Diet';
import Equivalences from '@/pages/Equivalences';
import Layout from '@/components/Layout';
import NotFound from '@/pages/NotFound';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, loading } = useAuthContext();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!session) return <Navigate to="/auth" replace />;
  return <Layout>{children}</Layout>;
};

const AuthRoute = () => {
  const { session, loading } = useAuthContext();
  if (loading) return null;
  if (session) return <Navigate to="/" replace />;
  return <Auth />;
};

const App = () => (
  <ErrorBoundary>
    <BrowserRouter>
      <AuthProvider>
        <AppDataProvider>
          <TooltipProvider>
            <Sonner />
            <Routes>
              <Route path="/auth" element={<AuthRoute />} />
              <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/workouts" element={<ProtectedRoute><Workouts /></ProtectedRoute>} />
              <Route path="/diet" element={<ProtectedRoute><Diet /></ProtectedRoute>} />
              <Route path="/equivalencias" element={<ProtectedRoute><Equivalences /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </TooltipProvider>
        </AppDataProvider>
      </AuthProvider>
    </BrowserRouter>
  </ErrorBoundary>
);

export default App;
