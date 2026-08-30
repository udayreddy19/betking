import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation, useNavigate, useSearchParams, Navigate } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import { ThemeProvider } from './context/ThemeContext';
import { BetSlipProvider } from './context/BetSlipContext';
import { LiveSportsProvider } from './context/LiveSportsContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CasinoProvider } from './context/CasinoContext';
import { springUi } from './utils/motionPresets';

import Header from './components/Header/Header';
import Footer from './components/Footer/Footer';
import Sidebar from './components/Sidebar/Sidebar';
import LoginModal from './components/LoginModal/LoginModal';
import DepositModal from './components/DepositModal/DepositModal';
import SessionIdleLogout from './components/SessionIdleLogout/SessionIdleLogout';
import Toast from './components/Toast/Toast';
import FinancialModals from './components/FinancialModals/FinancialModals';
import MobileBetSlip from './components/MobileBetSlip/MobileBetSlip';
import GlobalBetBar from './components/GlobalBetBar/GlobalBetBar';
import MobileBottomBar from './components/MobileBottomBar/MobileBottomBar';
import BetSettlementRunner from './components/BetSettlementRunner/BetSettlementRunner';
import GamePlayModal from './components/GamePlayModal/GamePlayModal';
import LiveChatSupportWidget from './components/LiveChatSupportWidget/LiveChatSupportWidget';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';
import RouteSeo from './components/RouteSeo/RouteSeo';
import PhoneRequiredGate from './components/PhoneRequiredGate/PhoneRequiredGate';
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute';
import { getAdminSessionState } from './utils/adminSession';
import { CASINO_ENABLED } from './utils/featureFlags';

import Home from './pages/Home/Home';
import Register from './pages/Register/Register';
import Profile from './pages/Profile/Profile';
import Fantasy from './pages/Fantasy/Fantasy';
import Promotions from './pages/Promotions/Promotions';
import Terms from './pages/Legal/Terms';
import Privacy from './pages/Legal/Privacy';
import ResponsibleGaming from './pages/Legal/ResponsibleGaming';
import Help from './pages/Legal/Help';
import NotFound from './pages/Legal/NotFound';

const VerifyEmailPage = lazy(() => import('./pages/Auth/VerifyEmailPage'));
const ResetPasswordPage = lazy(() => import('./pages/Auth/ResetPasswordPage'));
const OAuthGoogleCallback = lazy(() => import('./pages/Auth/OAuthGoogleCallback'));
const CompleteProfile = lazy(() => import('./pages/Auth/CompleteProfile'));

const Sports = lazy(() => import('./pages/Sports/Sports'));
const Casino = lazy(() => import('./pages/Casino/Casino'));
const LiveCasino = lazy(() => import('./pages/LiveCasino/LiveCasino'));
const Admin = lazy(() => import('./pages/Admin/Admin'));
const TraderConsole = lazy(() => import('./pages/Trader/TraderConsole'));
const ApiDocs = lazy(() => import('./pages/ApiDocs/ApiDocs'));
const Vip = lazy(() => import('./pages/Vip/Vip'));
const IPLSRLAdmin = lazy(() => import('./pages/Admin/IPLSRL/IPLSRLAdmin'));
const NotificationCenter = lazy(() => import('./pages/Notifications/NotificationCenter'));
const WalletDashboard = lazy(() => import('./pages/Wallet/WalletDashboard'));
const SupportHome = lazy(() => import('./pages/Support/SupportHome'));
const TicketsListPage = lazy(() => import('./pages/Support/TicketsListPage'));
const CreateTicketPage = lazy(() => import('./pages/Support/CreateTicketPage'));
const TicketDetailPage = lazy(() => import('./pages/Support/TicketDetailPage'));
const MyRewards = lazy(() => import('./pages/Rewards/MyRewards'));

function CasinoComingSoon() {
  return <Navigate to="/sports" replace />;
}

function PageLoader() {
  return <div className="page-loader" role="status">Loading…</div>;
}

function AdminProtectedRoute({ children }) {
  const session = getAdminSessionState();
  if (session.valid) return children;
  return <Navigate to="/admin" replace />;
}

function LoginPageRedirect() {
  const { isLoggedIn, openLoginModal } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const redirectTarget = searchParams.get('redirect') || '/sports';

  useEffect(() => {
    if (isLoggedIn) {
      navigate(redirectTarget, { replace: true });
    } else {
      openLoginModal();
    }
  }, [isLoggedIn, navigate, redirectTarget, openLoginModal]);

  return <Home />;
}

function AppFinancialModals() {
  const { finModalType, closeFinModal } = useAuth();
  return <FinancialModals modalType={finModalType} onClose={closeFinModal} />;
}

function AppLayout() {
  const { isLoggedIn } = useAuth();
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');
  const isDevRoute = location.pathname.startsWith('/developer') || location.pathname.startsWith('/api-docs');
  const isSportsRoute = location.pathname === '/sports' || location.pathname === '/live-betting';
  const isRegisterRoute = location.pathname === '/register' || location.pathname === '/complete-profile';
  const mainClass = [
    'app-main',
    isAdminRoute ? 'app-main--admin' : '',
    isDevRoute ? 'app-main--developer' : '',
    isSportsRoute ? 'app-main--sports' : '',
    isRegisterRoute ? 'app-main--register' : '',
  ].filter(Boolean).join(' ');

  return (
    <>
      <RouteSeo />
      <PhoneRequiredGate />
      <Header />
      <ErrorBoundary fallback={null}>
        <Sidebar />
      </ErrorBoundary>
      <LoginModal />
      <DepositModal />
      <SessionIdleLogout />
      <AppFinancialModals />
      <Toast />
      {isLoggedIn && <GamePlayModal />}
      {isLoggedIn && <BetSettlementRunner />}
      {isLoggedIn && <MobileBetSlip />}
      {isLoggedIn && <GlobalBetBar />}
      {!isAdminRoute && !isDevRoute && !isRegisterRoute && <MobileBottomBar />}
      <main className={mainClass}>
        <ErrorBoundary resetKey={location.pathname}>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<LoginPageRedirect />} />
              <Route path="/register" element={<Register />} />
              <Route path="/complete-profile" element={<CompleteProfile />} />
              <Route path="/_oauth/google" element={<OAuthGoogleCallback />} />
              <Route path="/verify-email" element={<VerifyEmailPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/responsible-gaming" element={<ResponsibleGaming />} />
              <Route path="/help" element={<Help />} />
              <Route path="/support" element={<SupportHome />} />

              {/* Protected Sports & Account Routes */}
              <Route path="/live-betting" element={<ProtectedRoute><Sports /></ProtectedRoute>} />
              <Route path="/sports" element={<ProtectedRoute><Sports /></ProtectedRoute>} />
              <Route path="/matches" element={<ProtectedRoute><Sports /></ProtectedRoute>} />
              <Route path="/match/:id" element={<ProtectedRoute><Sports /></ProtectedRoute>} />
              <Route path="/roster" element={<ProtectedRoute><Sports /></ProtectedRoute>} />
              <Route path="/casino" element={<ProtectedRoute>{CASINO_ENABLED ? <Casino /> : <CasinoComingSoon />}</ProtectedRoute>} />
              <Route path="/live-casino" element={<ProtectedRoute>{CASINO_ENABLED ? <LiveCasino /> : <CasinoComingSoon />}</ProtectedRoute>} />
              <Route path="/fantasy" element={<ProtectedRoute><Fantasy /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="/wallet" element={<ProtectedRoute><WalletDashboard /></ProtectedRoute>} />
              <Route path="/promotions" element={<ProtectedRoute><Promotions /></ProtectedRoute>} />
              <Route path="/rewards" element={<ProtectedRoute><MyRewards /></ProtectedRoute>} />
              <Route path="/my-rewards" element={<ProtectedRoute><MyRewards /></ProtectedRoute>} />
              <Route path="/notifications" element={<ProtectedRoute><NotificationCenter /></ProtectedRoute>} />
              <Route path="/vip" element={<ProtectedRoute><Vip /></ProtectedRoute>} />
              <Route path="/support/tickets" element={<ProtectedRoute><TicketsListPage /></ProtectedRoute>} />
              <Route path="/support/tickets/new" element={<ProtectedRoute><CreateTicketPage /></ProtectedRoute>} />
              <Route path="/support/tickets/:ticketReference" element={<ProtectedRoute><TicketDetailPage /></ProtectedRoute>} />

              {/* SRL & Navigation Aliases */}
              <Route path="/iplsrl" element={<ProtectedRoute><Navigate to="/sports?league=ipl-srl" replace /></ProtectedRoute>} />
              <Route path="/iplsrl/match-center" element={<ProtectedRoute><Navigate to="/sports?league=ipl-srl" replace /></ProtectedRoute>} />
              <Route path="/iplsrl/standings" element={<ProtectedRoute><Navigate to="/sports?league=ipl-srl" replace /></ProtectedRoute>} />
              <Route path="/iplsrl/stats" element={<ProtectedRoute><Navigate to="/sports?league=ipl-srl" replace /></ProtectedRoute>} />
              <Route path="/iplsrl/teams" element={<ProtectedRoute><Navigate to="/sports?league=ipl-srl" replace /></ProtectedRoute>} />

              {/* Admin Routes */}
              <Route
                path="/admin/iplsrl"
                element={(
                  <AdminProtectedRoute>
                    <IPLSRLAdmin />
                  </AdminProtectedRoute>
                )}
              />
              <Route path="/admin" element={<Admin />} />
              <Route path="/admin/*" element={<Admin />} />
              <Route
                path="/trader"
                element={(
                  <AdminProtectedRoute>
                    <TraderConsole />
                  </AdminProtectedRoute>
                )}
              />
              <Route
                path="/developer"
                element={(
                  <AdminProtectedRoute>
                    <ApiDocs />
                  </AdminProtectedRoute>
                )}
              />
              <Route
                path="/api-docs"
                element={(
                  <AdminProtectedRoute>
                    <ApiDocs />
                  </AdminProtectedRoute>
                )}
              />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
      {!isAdminRoute && !isDevRoute && !isRegisterRoute && <Footer />}
      {!isAdminRoute && !isDevRoute && !isRegisterRoute && <LiveChatSupportWidget />}
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MotionConfig
        reducedMotion="user"
        transition={springUi}
      >
        <ThemeProvider>
          <BrowserRouter>
            <AuthProvider>
              <CasinoProvider>
                <LiveSportsProvider>
                  <BetSlipProvider>
                    <AppLayout />
                  </BetSlipProvider>
                </LiveSportsProvider>
              </CasinoProvider>
            </AuthProvider>
          </BrowserRouter>
        </ThemeProvider>
      </MotionConfig>
    </ErrorBoundary>
  );
}
