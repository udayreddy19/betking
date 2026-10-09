import { Suspense } from 'react';
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import { ThemeProvider } from './context/ThemeContext';
import { BetSlipProvider } from './context/BetSlipContext';
import { LiveSportsProvider } from './context/LiveSportsContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CasinoProvider } from './context/CasinoContext';
import { springUi } from './utils/motionPresets';
import { lazyWithRetry } from './utils/lazyWithRetry';

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
import { getAdminSessionState } from './utils/adminSession';
import { CASINO_ENABLED } from './utils/featureFlags';
import { FeatureFlagsProvider, useFeatureFlags } from './context/FeatureFlagsContext';
import { ProductProvider, useProducts } from './context/ProductContext';
import ProductUnavailable from './components/ProductUnavailable/ProductUnavailable';

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

const VerifyEmailPage = lazyWithRetry(() => import('./pages/Auth/VerifyEmailPage'));
const ResetPasswordPage = lazyWithRetry(() => import('./pages/Auth/ResetPasswordPage'));
const OAuthGoogleCallback = lazyWithRetry(() => import('./pages/Auth/OAuthGoogleCallback'));
const CompleteProfile = lazyWithRetry(() => import('./pages/Auth/CompleteProfile'));

const Sports = lazyWithRetry(() => import('./pages/Sports/Sports'));
const Casino = lazyWithRetry(() => import('./pages/Casino/Casino'));
const LiveCasino = lazyWithRetry(() => import('./pages/LiveCasino/LiveCasino'));
const Admin = lazyWithRetry(() => import('./pages/Admin/Admin'));
const TraderConsole = lazyWithRetry(() => import('./pages/Trader/TraderConsole'));
const ApiDocs = lazyWithRetry(() => import('./pages/ApiDocs/ApiDocs'));
const Vip = lazyWithRetry(() => import('./pages/Vip/Vip'));
const IPLSRLAdmin = lazyWithRetry(() => import('./pages/Admin/IPLSRL/IPLSRLAdmin'));
const NotificationCenter = lazyWithRetry(() => import('./pages/Notifications/NotificationCenter'));
const MyBetsPage = lazyWithRetry(() => import('./pages/MyBets/MyBetsPage'));
const InvitePage = lazyWithRetry(() => import('./pages/Invite/InvitePage'));
const LiveCricketBetting = lazyWithRetry(() => import('./pages/Seo/LiveCricketBetting'));
const HowToBetLiveCricket = lazyWithRetry(() => import('./pages/Seo/HowToBetLiveCricket'));
const UpiDeposits = lazyWithRetry(() => import('./pages/Seo/UpiDeposits'));
const WhatIsOddsYraSrl = lazyWithRetry(() => import('./pages/Seo/WhatIsOddsYraSrl'));
const CricketBettingGuide = lazyWithRetry(() => import('./pages/Seo/CricketBettingGuide'));
const WalletDashboard = lazyWithRetry(() => import('./pages/Wallet/WalletDashboard'));
const SupportHome = lazyWithRetry(() => import('./pages/Support/SupportHome'));
const TicketsListPage = lazyWithRetry(() => import('./pages/Support/TicketsListPage'));
const CreateTicketPage = lazyWithRetry(() => import('./pages/Support/CreateTicketPage'));
const TicketDetailPage = lazyWithRetry(() => import('./pages/Support/TicketDetailPage'));
const MyRewards = lazyWithRetry(() => import('./pages/Rewards/MyRewards'));
const OddsYraSrl = lazyWithRetry(() => import('./pages/Srl/OddsYraSrl'));
const DepositPage = lazyWithRetry(() => import('./pages/Wallet/DepositPage'));

function CasinoComingSoon() {
  return <Navigate to="/" replace />;
}

function FlaggedRoute({ flagKey, children, fallback = '/' }) {
  const { isEnabled, ready } = useFeatureFlags();
  // Fail closed until flags hydrate; after that missing keys stay on (opt-out toggles).
  if (!ready || !isEnabled(flagKey, true)) {
    return <Navigate to={fallback} replace />;
  }
  return children;
}

/** Gate a route by Admin product toggle (wallet | betting). */
function ProductRoute({ product, children }) {
  const { ready, walletEnabled, bettingEnabled } = useProducts();
  if (!ready) return <PageLoader />;
  const enabled = product === 'wallet' ? walletEnabled : bettingEnabled;
  if (!enabled) {
    return <ProductUnavailable product={product} />;
  }
  return children;
}

/** When both products are off, show a controlled unavailable page (admin still reachable). */
function PlatformGate({ children }) {
  const location = useLocation();
  const { ready, walletEnabled, bettingEnabled } = useProducts();
  const path = location.pathname || '/';
  const isExempt = path.startsWith('/admin')
    || path.startsWith('/trader')
    || path.startsWith('/developer')
    || path.startsWith('/api-docs')
    || path.startsWith('/register')
    || path.startsWith('/complete-profile')
    || path.startsWith('/verify-email')
    || path.startsWith('/reset-password')
    || path.startsWith('/_oauth')
    || path.startsWith('/terms')
    || path.startsWith('/privacy')
    || path.startsWith('/help')
    || path.startsWith('/support')
    || path.startsWith('/responsible-gaming');
  if (!ready) return children;
  if (!walletEnabled && !bettingEnabled && !isExempt) {
    return <ProductUnavailable />;
  }
  return children;
}

function PageLoader() {
  return <div className="page-loader" role="status">Loading…</div>;
}

function AdminProtectedRoute({ children }) {
  const session = getAdminSessionState();
  if (session.valid) return children;
  return <Navigate to="/admin" replace />;
}

function AppFinancialModals() {
  const { finModalType, closeFinModal } = useAuth();
  return <FinancialModals modalType={finModalType} onClose={closeFinModal} />;
}

function AppLayout() {
  const location = useLocation();
  const { bettingEnabled, walletEnabled } = useProducts();
  const isAdminRoute = location.pathname.startsWith('/admin');
  const isDevRoute = location.pathname.startsWith('/developer') || location.pathname.startsWith('/api-docs');
  const isSportsRoute = location.pathname === '/sports' || location.pathname === '/live-betting';
  const isRegisterRoute = location.pathname === '/register' || location.pathname === '/complete-profile';
  const isDepositRoute = location.pathname === '/wallet/deposit' || location.pathname === '/deposit';
  const mainClass = [
    'app-main',
    isAdminRoute ? 'app-main--admin' : '',
    isDevRoute ? 'app-main--developer' : '',
    isSportsRoute ? 'app-main--sports' : '',
    isRegisterRoute ? 'app-main--register' : '',
    isDepositRoute ? 'app-main--deposit' : '',
  ].filter(Boolean).join(' ');

  return (
    <>
      <RouteSeo />
      <PhoneRequiredGate />
      {!isDepositRoute && <Header />}
      {!isDepositRoute && (
        <ErrorBoundary fallback={null}>
          <Sidebar />
        </ErrorBoundary>
      )}
      <LoginModal />
      {walletEnabled && <DepositModal />}
      <SessionIdleLogout />
      <AppFinancialModals />
      <Toast />
      {!isDepositRoute && bettingEnabled && <GamePlayModal />}
      {bettingEnabled && <BetSettlementRunner />}
      {!isDepositRoute && bettingEnabled && <MobileBetSlip />}
      {!isDepositRoute && bettingEnabled && <GlobalBetBar />}
      {!isAdminRoute && !isDevRoute && !isRegisterRoute && !isDepositRoute && <MobileBottomBar />}
      <main className={mainClass}>
        <ErrorBoundary resetKey={location.pathname}>
          <Suspense fallback={<PageLoader />}>
            <PlatformGate>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/live-betting" element={<ProductRoute product="betting"><Sports /></ProductRoute>} />
              <Route path="/sports" element={<ProductRoute product="betting"><Sports /></ProductRoute>} />
              <Route path="/wallet/deposit" element={<ProductRoute product="wallet"><DepositPage /></ProductRoute>} />
              <Route path="/deposit" element={<Navigate to="/wallet/deposit" replace />} />
              <Route path="/casino" element={<ProductRoute product="betting">{CASINO_ENABLED ? <Casino /> : <CasinoComingSoon />}</ProductRoute>} />
              <Route path="/live-casino" element={<ProductRoute product="betting">{CASINO_ENABLED ? <LiveCasino /> : <CasinoComingSoon />}</ProductRoute>} />
              <Route path="/fantasy" element={<ProductRoute product="betting"><Fantasy /></ProductRoute>} />
              <Route path="/bets" element={<ProductRoute product="betting"><MyBetsPage /></ProductRoute>} />
              <Route path="/invite" element={<FlaggedRoute flagKey="referral_system_ui"><InvitePage /></FlaggedRoute>} />
              <Route path="/live-cricket-betting" element={<ProductRoute product="betting"><LiveCricketBetting /></ProductRoute>} />
              <Route path="/how-to-bet-live-cricket" element={<ProductRoute product="betting"><HowToBetLiveCricket /></ProductRoute>} />
              <Route path="/upi-deposits" element={<ProductRoute product="wallet"><UpiDeposits /></ProductRoute>} />
              <Route path="/what-is-oddsyra-srl" element={<ProductRoute product="betting"><WhatIsOddsYraSrl /></ProductRoute>} />
              <Route path="/cricket-betting-guide" element={<ProductRoute product="betting"><CricketBettingGuide /></ProductRoute>} />
              <Route path="/exchange" element={<CasinoComingSoon />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/wallet" element={<ProductRoute product="wallet"><WalletDashboard /></ProductRoute>} />
              <Route path="/register" element={<Register />} />
              <Route path="/complete-profile" element={<CompleteProfile />} />
              <Route path="/_oauth/google" element={<OAuthGoogleCallback />} />
              <Route path="/verify-email" element={<VerifyEmailPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/promotions" element={<FlaggedRoute flagKey="promotion_engine_ui"><Promotions /></FlaggedRoute>} />
              <Route path="/rewards" element={<MyRewards />} />
              <Route path="/my-rewards" element={<MyRewards />} />
              <Route path="/notifications" element={<FlaggedRoute flagKey="notification_center"><NotificationCenter /></FlaggedRoute>} />
              <Route path="/vip" element={<Vip />} />
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
              <Route path="/srl" element={<ProductRoute product="betting"><FlaggedRoute flagKey="oddsyra_srl_ui"><OddsYraSrl /></FlaggedRoute></ProductRoute>} />
              <Route path="/oddsyra-srl" element={<Navigate to="/srl" replace />} />
              <Route path="/iplsrl" element={<Navigate to="/srl" replace />} />
              <Route path="/iplsrl/match-center" element={<Navigate to="/srl" replace />} />
              <Route path="/iplsrl/standings" element={<Navigate to="/srl?tab=points" replace />} />
              <Route path="/iplsrl/stats" element={<Navigate to="/srl" replace />} />
              <Route path="/iplsrl/teams" element={<Navigate to="/srl?tab=schedule" replace />} />
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
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/responsible-gaming" element={<FlaggedRoute flagKey="responsible_gaming_ui"><ResponsibleGaming /></FlaggedRoute>} />
              <Route path="/help" element={<Help />} />
              <Route path="/support" element={<SupportHome />} />
              <Route path="/support/tickets" element={<TicketsListPage />} />
              <Route path="/support/tickets/new" element={<CreateTicketPage />} />
              <Route path="/support/tickets/:ticketReference" element={<TicketDetailPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </PlatformGate>
          </Suspense>
        </ErrorBoundary>
      </main>
      {!isAdminRoute && !isDevRoute && !isRegisterRoute && !isDepositRoute && <Footer />}
      {!isAdminRoute && !isDevRoute && !isRegisterRoute && !isDepositRoute && <LiveChatSupportWidget />}
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
              <FeatureFlagsProvider>
                <ProductProvider>
                  <CasinoProvider>
                    <LiveSportsProvider>
                      <BetSlipProvider>
                        <AppLayout />
                      </BetSlipProvider>
                    </LiveSportsProvider>
                  </CasinoProvider>
                </ProductProvider>
              </FeatureFlagsProvider>
            </AuthProvider>
          </BrowserRouter>
        </ThemeProvider>
      </MotionConfig>
    </ErrorBoundary>
  );
}
