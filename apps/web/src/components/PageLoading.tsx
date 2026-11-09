import { Component, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth-context.js';
import { NavBar } from './NavBar.js';
import { Alert, Button, DataLoading, PageShell } from './ui.js';

export function PageLoading() {
  const { user } = useAuth();
  return (
    <PageShell>
      <h1 className="text-xl font-bold">WOD Coach AI</h1>
      {user && <NavBar />}
      <DataLoading message="Carregando tela..." />
    </PageShell>
  );
}

class LoadBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <PageShell>
        <NavBar />
        <Alert>Não foi possível abrir a tela. Verifique sua conexão e tente novamente.</Alert>
        <Button onClick={() => window.location.reload()}>Recarregar aplicativo</Button>
      </PageShell>
    ) : (
      this.props.children
    );
  }
}

export function PageLoadBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { user } = useAuth();
  // The fallback also contains private notification state, outside the outlet.
  return <LoadBoundary key={`${user?.id ?? 'anonymous'}:${pathname}`}>{children}</LoadBoundary>;
}
