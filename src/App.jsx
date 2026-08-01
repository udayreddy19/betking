import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { BetSlipProvider } from './context/BetSlipContext';
import { LiveSportsProvider } from './context/LiveSportsContext';

import Header from './components/Header/Header';
import Footer from './components/Footer/Footer';
import Sidebar from './components/Sidebar/Sidebar';
import LoginModal from './components/LoginModal/LoginModal';
import DepositModal from './components/DepositModal/DepositModal';
import Toast from './components/Toast/Toast';

import Home from './pages/Home/Home';
import Sports from './pages/Sports/Sports';
import Casino from './pages/Casino/Casino';
import LiveCasino from './pages/LiveCasino/LiveCasino';
import Register from './pages/Register/Register';
import Promotions from './pages/Promotions/Promotions';

function AppLayout() {
  return (
    <>
      <Header />
      <Sidebar />
      <LoginModal />
      <DepositModal />
      <Toast />
      <main style={{ minHeight: 'calc(100vh - var(--header-height) - 300px)', padding: 'var(--space-6) 0' }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/live-betting" element={<Sports />} />
          <Route path="/sports" element={<Sports />} />
          <Route path="/casino" element={<Casino />} />
          <Route path="/live-casino" element={<LiveCasino />} />
          <Route path="/fantasy" element={<Sports />} />
          <Route path="/register" element={<Register />} />
          <Route path="/promotions" element={<Promotions />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
      <Footer />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <LiveSportsProvider>
          <BetSlipProvider>
            <AppLayout />
          </BetSlipProvider>
        </LiveSportsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
