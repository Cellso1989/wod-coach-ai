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

  // A different account must get new page state as well as an empty read cache.
  return <Outlet key={user.id} />;
}

export function AdminRoute() {
  const { user } = useAuth();
  return user?.isAdmin ? <Outlet /> : <Navigate to="/" replace />;
}
