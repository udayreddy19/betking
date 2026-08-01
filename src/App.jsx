import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { BetSlipProvider } from './context/BetSlipContext';
import { LiveSportsProvider } from './context/LiveSportsContext';
import { AuthProvider } from './context/AuthContext';
import { CasinoProvider } from './context/CasinoContext';

import Header from './components/Header/Header';
import Footer from './components/Footer/Footer';
import Sidebar from './components/Sidebar/Sidebar';
import LoginModal from './components/LoginModal/LoginModal';
import DepositModal from './components/DepositModal/DepositModal';
import Toast from './components/Toast/Toast';
import MobileBetSlip from './components/MobileBetSlip/MobileBetSlip';
import GlobalBetBar from './components/GlobalBetBar/GlobalBetBar';
import GamePlayModal from './components/GamePlayModal/GamePlayModal';
import BetSettlementRunner from './components/BetSettlementRunner/BetSettlementRunner';


import Home from './pages/Home/Home';
import Sports from './pages/Sports/Sports';
import Casino from './pages/Casino/Casino';
import LiveCasino from './pages/LiveCasino/LiveCasino';
import Register from './pages/Register/Register';
import Profile from './pages/Profile/Profile';
import Fantasy from './pages/Fantasy/Fantasy';
import Promotions from './pages/Promotions/Promotions';
import Terms from './pages/Legal/Terms';
import Privacy from './pages/Legal/Privacy';
import ResponsibleGaming from './pages/Legal/ResponsibleGaming';
import Help from './pages/Legal/Help';
import NotFound from './pages/Legal/NotFound';

function AppLayout() {
  return (
    <>
      <Header />
      <Sidebar />
      <LoginModal />
      <DepositModal />
      <Toast />
      <GamePlayModal />
      <BetSettlementRunner />
      <MobileBetSlip />
      <GlobalBetBar />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/live-betting" element={<Sports />} />
          <Route path="/sports" element={<Sports />} />
          <Route path="/casino" element={<Casino />} />
          <Route path="/live-casino" element={<LiveCasino />} />
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
  );
}
