import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth-context.js';
import { LoadingState } from './ui.js';

export function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingState />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

export function AdminRoute() {
  const { user } = useAuth();
  return user?.isAdmin ? <Outlet /> : <Navigate to="/" replace />;
}
