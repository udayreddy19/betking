import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { BetSlipProvider } from './context/BetSlipContext';
import { LiveSportsProvider } from './context/LiveSportsContext';
import { AuthProvider } from './context/AuthContext';

import Header from './components/Header/Header';
import Footer from './components/Footer/Footer';
import Sidebar from './components/Sidebar/Sidebar';
import LoginModal from './components/LoginModal/LoginModal';
import DepositModal from './components/DepositModal/DepositModal';
import Toast from './components/Toast/Toast';
import MobileBetSlip from './components/MobileBetSlip/MobileBetSlip';
import GlobalBetBar from './components/GlobalBetBar/GlobalBetBar';
import BetSettlementRunner from './components/BetSettlementRunner/BetSettlementRunner';
import PageTransition from './components/motion/PageTransition';
import BackToTop from './components/ui/BackToTop';
import './components/ui/ui.css';

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

const Sports = lazy(() => import('./pages/Sports/Sports'));

function PageLoader() {
  return (
    <div className="page-loader" role="status">
      <div className="ui-skeleton" style={{ width: 120, height: 16, margin: 'auto' }} />
    </div>
  );
}

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <PageTransition>
      <Routes location={location}>
        <Route path="/" element={<Home />} />
        <Route path="/live-betting" element={<Sports />} />
        <Route path="/sports" element={<Sports />} />
        <Route path="/fantasy" element={<Fantasy />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/register" element={<Register />} />
        <Route path="/promotions" element={<Promotions />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/responsible-gaming" element={<ResponsibleGaming />} />
        <Route path="/help" element={<Help />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </PageTransition>
  );
}

function AppLayout() {
  return (
    <>
      <Header />
      <Sidebar />
      <LoginModal />
      <DepositModal />
      <Toast />
      <BetSettlementRunner />
      <MobileBetSlip />
      <GlobalBetBar />
      <BackToTop />
      <main className="app-main">
        <Suspense fallback={<PageLoader />}>
          <AnimatedRoutes />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <LiveSportsProvider>
            <BetSlipProvider>
              <AppLayout />
            </BetSlipProvider>
          </LiveSportsProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
