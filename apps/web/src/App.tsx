import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './lib/auth-provider.js';
import { ThemeProvider } from './lib/theme-provider.js';
import { ProtectedRoute } from './components/ProtectedRoute.js';
import { LoginPage } from './pages/LoginPage.js';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage.js';
import { RegisterPage } from './pages/RegisterPage.js';
import { ResetPasswordPage } from './pages/ResetPasswordPage.js';
import { ProfilePage } from './pages/ProfilePage.js';
import { CheckinPage } from './pages/CheckinPage.js';
import { SubmitWodPage } from './pages/SubmitWodPage.js';
import { WodListPage } from './pages/WodListPage.js';
import { WodDetailPage } from './pages/WodDetailPage.js';
import { PersonalRecordsPage } from './pages/PersonalRecordsPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { TreadmillPage } from './pages/TreadmillPage.js';
import { AdminPage } from './pages/AdminPage.js';

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/checkin" element={<CheckinPage />} />
              <Route path="/wods/new" element={<SubmitWodPage />} />
              <Route path="/wods/:id" element={<WodDetailPage />} />
              <Route path="/wods" element={<WodListPage />} />
              <Route path="/personal-records" element={<PersonalRecordsPage />} />
              <Route path="/treadmill" element={<TreadmillPage />} />
              <Route path="/admin" element={<AdminPage />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
