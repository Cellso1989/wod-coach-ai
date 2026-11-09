import { Suspense, useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from './lib/auth-provider.js';
import { ThemeProvider } from './lib/theme-provider.js';
import { PageLoading, PageLoadBoundary } from './components/PageLoading.js';
import { preloadRoutePage } from './lib/route-pages.js';
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute.js';
import { LoginPage } from './pages/LoginPage.js';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage.js';
import { RegisterPage } from './pages/RegisterPage.js';
import { ResetPasswordPage } from './pages/ResetPasswordPage.js';
import { DashboardPage } from './pages/DashboardPage.js';

import {
  ProfilePage,
  CheckinPage,
  SubmitWodPage,
  WodListPage,
  WodDetailPage,
  PersonalRecordsPage,
  HyroxPage,
  SubmitHyroxPage,
  HyroxDetailPage,
  AdminPage,
  RankingPage,
  StrategyPreviewPage,
} from './lib/route-pages.js';

function RoutePreloader() {
  const { pathname } = useLocation();
  // Download only this route's code while the session check is in flight.
  useEffect(() => preloadRoutePage(pathname), [pathname]);
  return null;
}

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <RoutePreloader />
          <PageLoadBoundary>
            <Suspense fallback={<PageLoading />}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/register" element={<RegisterPage />} />
                {import.meta.env.DEV && (
                  <>
                    <Route path="/preview/ranking" element={<RankingPage demo />} />
                    <Route path="/preview/strategy" element={<StrategyPreviewPage />} />
                    <Route path="/preview/wods" element={<WodListPage demo />} />
                    <Route path="/preview/hyrox" element={<HyroxPage demo />} />
                  </>
                )}
                <Route element={<ProtectedRoute />}>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/profile" element={<ProfilePage />} />
                  <Route path="/checkin" element={<CheckinPage />} />
                  <Route path="/wods/new" element={<SubmitWodPage />} />
                  <Route path="/wods/:id" element={<WodDetailPage />} />
                  <Route path="/wods" element={<WodListPage />} />
                  <Route path="/personal-records" element={<PersonalRecordsPage />} />
                  <Route path="/ranking" element={<RankingPage />} />
                  <Route path="/hyrox/new" element={<SubmitHyroxPage />} />
                  <Route path="/hyrox/:id" element={<HyroxDetailPage />} />
                  <Route path="/hyrox" element={<HyroxPage />} />
                  <Route element={<AdminRoute />}>
                    <Route path="/admin" element={<AdminPage />} />
                  </Route>
                </Route>
              </Routes>
            </Suspense>
          </PageLoadBoundary>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
