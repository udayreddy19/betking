import { useState } from 'react';
import { IoClose, IoShieldCheckmark, IoLockClosed } from '../../icons';
import './RazorpayModal.css';

export default function RazorpayModal({ isOpen, onClose, amount, onSuccess, user }) {
  const [tab, setTab] = useState('upi'); // 'upi' | 'card' | 'netbanking' | 'wallet'

  // Card State
  const [cardNumber, setCardNumber] = useState('4111 1111 1111 1111');
  const [expiry, setExpiry] = useState('12/28');
  const [cvv, setCvv] = useState('123');
  const [cardName, setCardName] = useState(user?.displayName || 'John Doe');

  // UPI State
  const [upiId, setUpiId] = useState('john@okicici');

  // Netbanking State
  const [selectedBank, setSelectedBank] = useState('SBI');

  // Payment execution / OTP step
  const [step, setStep] = useState('form'); // 'form' | 'otp' | 'loading'
  const [otp, setOtp] = useState('123456');

  if (!isOpen) return null;

  const handlePayClick = (e) => {
    e.preventDefault();
    setStep('otp');
  };

  const handleOtpSubmit = (e) => {
    e.preventDefault();
    setStep('loading');
    setTimeout(() => {
      onSuccess(amount);
      setStep('form');
    }, 1200);
  };

  return (
    <div className="rzp-overlay" onClick={onClose}>
      <div className="rzp-card" onClick={e => e.stopPropagation()}>
        {/* Navy Blue Razorpay Header */}
        <div className="rzp-header">
          <div className="rzp-header-left">
            <div className="rzp-logo">B</div>
            <div className="rzp-title">
              <h3>BetKing Gaming</h3>
              <p>Account Deposit</p>
            </div>
          </div>
          <div className="rzp-amount">
            <div className="rzp-amount-val">₹{parseFloat(amount || 0).toLocaleString()}</div>
            <button className="rzp-close" onClick={onClose} aria-label="Close">
              <IoClose />
            </button>
          </div>
        </div>

        {step === 'otp' ? (
          /* 3D Secure Bank OTP Verification Screen */
          <div className="rzp-otp-card">
            <IoLockClosed className="rzp-otp-icon" />
            <h3 style={{ fontSize: '1.1rem', margin: '0 0 4px 0' }}>Bank Security Verification</h3>
            <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>
              An OTP has been sent to your registered mobile number for ₹{parseFloat(amount).toLocaleString()}
            </p>

            <form onSubmit={handleOtpSubmit}>
              <input
                type="text"
                className="rzp-input rzp-otp-input"
                maxLength={6}
                value={otp}
                onChange={e => setOtp(e.target.value)}
                required
              />
              <button type="submit" className="rzp-pay-btn" style={{ background: '#22c55e', marginTop: '12px' }}>
                <IoShieldCheckmark /> Authorize & Pay ₹{parseFloat(amount).toLocaleString()}
              </button>
            </form>
          </div>
        ) : step === 'loading' ? (
          /* Processing Loader Screen */
          <div style={{ padding: '60px 20px', textAlignment: 'center', textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🔄</div>
            <h3 style={{ fontSize: '1rem', margin: '0 0 6px 0' }}>Processing Payment...</h3>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: 0 }}>Communicating with Razorpay gateway</p>
          </div>
        ) : (
          /* Main Razorpay Payment Options Form */
          <div className="rzp-body">
            {/* Left Options Navigation */}
            <div className="rzp-sidebar">
              <button
                className={`rzp-tab ${tab === 'upi' ? 'active' : ''}`}
                onClick={() => setTab('upi')}
              >
                📱 UPI
              </button>
              <button
                className={`rzp-tab ${tab === 'card' ? 'active' : ''}`}
                onClick={() => setTab('card')}
              >
                💳 Card
              </button>
              <button
                className={`rzp-tab ${tab === 'netbanking' ? 'active' : ''}`}
                onClick={() => setTab('netbanking')}
              >
                🏦 NetBanking
              </button>
              <button
                className={`rzp-tab ${tab === 'wallet' ? 'active' : ''}`}
                onClick={() => setTab('wallet')}
              >
                👛 Wallet
              </button>
            </div>

            {/* Right Options Content Form */}
            <div className="rzp-content">
              <form onSubmit={handlePayClick} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                {tab === 'upi' && (
                  <>
                    <div className="rzp-form-group">
                      <label>Popular Apps</label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                        <button type="button" style={{ padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, background: '#f8fafc' }}>
                          🔵 Google Pay
                        </button>
                        <button type="button" style={{ padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, background: '#f8fafc' }}>
                          🟣 PhonePe
                        </button>
                      </div>
                    </div>
                    <div className="rzp-form-group">
                      <label>Enter UPI ID (VPA)</label>
                      <input
                        type="text"
                        className="rzp-input"
                        placeholder="e.g. username@upi"
                        value={upiId}
                        onChange={e => setUpiId(e.target.value)}
                        required
                      />
                    </div>
                  </>
                )}

                {tab === 'card' && (
                  <>
                    <div className="rzp-form-group">
                      <label>Card Number</label>
                      <input
                        type="text"
                        className="rzp-input"
                        placeholder="4111 1111 1111 1111"
                        value={cardNumber}
                        onChange={e => setCardNumber(e.target.value)}
                        required
                      />
                    </div>
                    <div className="rzp-row">
                      <div className="rzp-form-group" style={{ flex: 1 }}>
                        <label>Expiry</label>
                        <input
                          type="text"
                          className="rzp-input"
                          placeholder="MM/YY"
                          value={expiry}
                          onChange={e => setExpiry(e.target.value)}
                          required
                        />
                      </div>
                      <div className="rzp-form-group" style={{ flex: 1 }}>
                        <label>CVV</label>
                        <input
                          type="password"
                          className="rzp-input"
                          placeholder="123"
                          maxLength={4}
                          value={cvv}
                          onChange={e => setCvv(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                    <div className="rzp-form-group">
                      <label>Cardholder Name</label>
                      <input
                        type="text"
                        className="rzp-input"
                        placeholder="Name on card"
                        value={cardName}
                        onChange={e => setCardName(e.target.value)}
                        required
                      />
                    </div>
                  </>
                )}

                {tab === 'netbanking' && (
                  <div className="rzp-form-group">
                    <label>Select Bank</label>
                    <select
                      className="rzp-input"
                      value={selectedBank}
                      onChange={e => setSelectedBank(e.target.value)}
                    >
                      <option value="SBI">State Bank of India (SBI)</option>
                      <option value="HDFC">HDFC Bank</option>
                      <option value="ICICI">ICICI Bank</option>
                      <option value="AXIS">Axis Bank</option>
                      <option value="KOTAK">Kotak Mahindra Bank</option>
                    </select>
                  </div>
                )}

                {tab === 'wallet' && (
                  <div className="rzp-form-group">
                    <label>Select Wallet</label>
                    <select className="rzp-input">
                      <option>Paytm Wallet</option>
                      <option>MobiKwik</option>
                      <option>Freecharge</option>
                      <option>Airtel Money</option>
                    </select>
                  </div>
                )}

                <button type="submit" className="rzp-pay-btn">
                  Pay ₹{parseFloat(amount || 0).toLocaleString()}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
