import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import { ThemeProvider } from './context/ThemeContext';
import { BetSlipProvider } from './context/BetSlipContext';
import { LiveSportsProvider } from './context/LiveSportsContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CasinoProvider } from './context/CasinoContext';

import Header from './components/Header/Header';
import Footer from './components/Footer/Footer';
import Sidebar from './components/Sidebar/Sidebar';
import LoginModal from './components/LoginModal/LoginModal';
import DepositModal from './components/DepositModal/DepositModal';
import Toast from './components/Toast/Toast';
import FinancialModals from './components/FinancialModals/FinancialModals';
import MobileBetSlip from './components/MobileBetSlip/MobileBetSlip';
import MobileBottomBar from './components/MobileBottomBar/MobileBottomBar';
import GlobalBetBar from './components/GlobalBetBar/GlobalBetBar';
import BetSettlementRunner from './components/BetSettlementRunner/BetSettlementRunner';
import GamePlayModal from './components/GamePlayModal/GamePlayModal';
import LiveChatSupportWidget from './components/LiveChatSupportWidget/LiveChatSupportWidget';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';

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

const Sports = lazy(() => import('./pages/Sports/Sports'));
const Casino = lazy(() => import('./pages/Casino/Casino'));
const LiveCasino = lazy(() => import('./pages/LiveCasino/LiveCasino'));
const Admin = lazy(() => import('./pages/Admin/Admin'));
const TraderConsole = lazy(() => import('./pages/Trader/TraderConsole'));
const ApiDocs = lazy(() => import('./pages/ApiDocs/ApiDocs'));
const Vip = lazy(() => import('./pages/Vip/Vip'));
const IPLSRLAdmin = lazy(() => import('./pages/Admin/IPLSRL/IPLSRLAdmin'));

function PageLoader() {
  return <div className="page-loader" role="status">Loading…</div>;
}

function AppFinancialModals() {
  const { finModalType, closeFinModal } = useAuth();
  return <FinancialModals modalType={finModalType} onClose={closeFinModal} />;
}

function AppLayout() {
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');

  return (
    <>
      <Header />
      <Sidebar />
      <LoginModal />
      <DepositModal />
      <AppFinancialModals />
      <Toast />
      <GamePlayModal />
      <BetSettlementRunner />
      <MobileBetSlip />
      {!isAdminRoute && <MobileBottomBar />}
      {!isAdminRoute && <GlobalBetBar />}
      <main className={`app-main${isAdminRoute ? ' app-main--admin' : ''}`}>
        <ErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/live-betting" element={<Sports />} />
              <Route path="/sports" element={<Sports />} />
              <Route path="/casino" element={<Casino />} />
              <Route path="/live-casino" element={<LiveCasino />} />
              <Route path="/fantasy" element={<Fantasy />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/register" element={<Register />} />
              <Route path="/verify-email" element={<VerifyEmailPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/promotions" element={<Promotions />} />
              <Route path="/vip" element={<Vip />} />
              <Route path="/admin/iplsrl" element={<IPLSRLAdmin />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/admin/*" element={<Admin />} />
              <Route path="/iplsrl" element={<Navigate to="/sports?league=ipl-srl" replace />} />
              <Route path="/iplsrl/match-center" element={<Navigate to="/sports?league=ipl-srl" replace />} />
              <Route path="/iplsrl/standings" element={<Navigate to="/sports?league=ipl-srl" replace />} />
              <Route path="/iplsrl/stats" element={<Navigate to="/sports?league=ipl-srl" replace />} />
              <Route path="/iplsrl/teams" element={<Navigate to="/sports?league=ipl-srl" replace />} />
              <Route path="/trader" element={<TraderConsole />} />
              <Route path="/developer" element={<ApiDocs />} />
              <Route path="/api-docs" element={<ApiDocs />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/responsible-gaming" element={<ResponsibleGaming />} />
              <Route path="/help" element={<Help />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
      {!isAdminRoute && <Footer />}
      {!isAdminRoute && <LiveChatSupportWidget />}
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MotionConfig
        reducedMotion="user"
        transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
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
