import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../utils/apiClient';
import './SupportPages.css';

export default function SupportHome() {
  const navigate = useNavigate();
  const { isLoggedIn, openLoginModal } = useAuth();
  const [overview, setOverview] = useState({
    activeTicketsCount: 0,
    activeLiveChat: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function loadOverview() {
      try {
        const res = await apiFetch('/api/v1/support/overview');
        const data = await res.json().catch(() => ({}));
        if (mounted && data.success) {
          setOverview({
            activeTicketsCount: data.activeTicketsCount || 0,
            activeLiveChat: data.activeLiveChat || null,
          });
        }
      } catch {
        // best effort
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadOverview();
    return () => {
      mounted = false;
    };
  }, []);

  const handleStartLiveChat = () => {
    window.dispatchEvent(new CustomEvent('oddsyra:open-support-chat'));
  };

  const handleCreateTicket = () => {
    if (!isLoggedIn) {
      openLoginModal();
      return;
    }
    navigate('/support/tickets/new');
  };

  return (
    <div className="support-container">
      <div className="support-header">
        <h1>Help & Support</h1>
        <p>Get assistance with your account, transactions, bets, and technical queries.</p>
      </div>

      <div className="support-cards-grid">
        {/* Live Chat Card */}
        <div className="support-card">
          <div>
            <div className="support-card__icon">💬</div>
            <h2 className="support-card__title">Live Chat</h2>
            <p className="support-card__desc">
              Chat directly with our dedicated support team in real time for instant help.
            </p>
          </div>
          <button type="button" className="support-btn" onClick={handleStartLiveChat}>
            Start Chat
          </button>
        </div>

        {/* Create Ticket Card */}
        <div className="support-card">
          <div>
            <div className="support-card__icon">🎫</div>
            <h2 className="support-card__title">Create Support Ticket</h2>
            <p className="support-card__desc">
              Submit an issue with attachments and track the resolution response.
            </p>
          </div>
          <button type="button" className="support-btn support-btn--secondary" onClick={handleCreateTicket}>
            Create Ticket
          </button>
        </div>

        {/* My Tickets Card */}
        <div className="support-card">
          <div>
            <div className="support-card__icon">📋</div>
            <h2 className="support-card__title">My Support Tickets</h2>
            <p className="support-card__desc">
              View, search, and reply to your active and past support tickets.
              {overview.activeTicketsCount > 0 && (
                <strong style={{ display: 'block', marginTop: '6px', color: '#60a5fa' }}>
                  {overview.activeTicketsCount} active ticket{overview.activeTicketsCount > 1 ? 's' : ''}
                </strong>
              )}
            </p>
          </div>
          <Link to="/support/tickets" className="support-btn support-btn--outline">
            View Tickets
          </Link>
        </div>
      </div>

      {/* Frequently Asked Questions */}
      <div className="support-faq-section">
        <h2>Frequently Asked Questions</h2>
        <div className="support-faq-grid">
          <div className="support-faq-item">
            <h3>How long do UPI withdrawals take?</h3>
            <p>UPI and NetBanking withdrawals to verified accounts are processed within 15 minutes.</p>
          </div>
          <div className="support-faq-item">
            <h3>How are live cricket bets settled?</h3>
            <p>Bets are settled instantly upon official verification of ball events and match status.</p>
          </div>
          <div className="support-faq-item">
            <h3>What documents are required for KYC?</h3>
            <p>Upload a clear photo of your Aadhaar Card and PAN Card in your Profile settings.</p>
          </div>
          <div className="support-faq-item">
            <h3>Can I reopen a closed support ticket?</h3>
            <p>Yes, sending a reply to a recently resolved ticket will automatically reopen it.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
