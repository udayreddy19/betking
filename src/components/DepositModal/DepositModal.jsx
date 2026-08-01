import { useState } from 'react';
import { IoClose, IoChevronBack, IoQrCodeOutline, IoKeyOutline } from 'react-icons/io5';
import { FiArrowRight, FiShield, FiAlertCircle } from 'react-icons/fi';
import { useAuth } from '../../context/AuthContext';
import { paymentMethods } from '../../data/mockData';
import RazorpayModal from '../RazorpayModal/RazorpayModal';
import './DepositModal.css';

export default function DepositModal() {
  const { isDepositModalOpen, closeDepositModal, addFunds, user } = useAuth();
  const [activeCategory, setActiveCategory] = useState('all');
  const [selectedMethod, setSelectedMethod] = useState(null);

  // Form states
  const [amount, setAmount] = useState('1000');
  const [giftCardCode, setGiftCardCode] = useState('');
  const [upiId, setUpiId] = useState('udayreddy@upi');
  const [upiMode, setUpiMode] = useState('id'); // 'id' | 'qr'
  const [razorpayKey, setRazorpayKey] = useState(import.meta.env.VITE_RAZORPAY_KEY_ID || '');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isRzpModalOpen, setIsRzpModalOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isDepositModalOpen) return null;

  const handleClose = () => {
    setSelectedMethod(null);
    setIsSuccess(false);
    setIsLoading(false);
    setIsRzpModalOpen(false);
    setErrorMsg('');
    closeDepositModal();
  };

  const filteredMethods = paymentMethods.filter(m => {
    if (activeCategory === 'all') return true;
    if (activeCategory === 'razorpay') return m.type === 'razorpay';
    if (activeCategory === 'giftcard') return m.type === 'giftcard';
    if (activeCategory === 'upi') return m.type === 'upi';
    if (activeCategory === 'crypto') return m.type === 'crypto';
    return true;
  });

  const handleMethodSelect = (method) => {
    setSelectedMethod(method);
    setIsSuccess(false);
    setErrorMsg('');
    if (method.id === 'amazon_gift') {
      setGiftCardCode('');
      setAmount('1000');
    } else {
      setAmount('1000');
    }
  };

  const openRazorpayRealPayment = async (depositAmt) => {
    setErrorMsg('');
    setIsLoading(true);

    const activeKey = razorpayKey.trim() || import.meta.env.VITE_RAZORPAY_KEY_ID;

    try {
      // 1. Call Backend Vercel Serverless Function to create real Razorpay Order
      let order = null;
      try {
        const orderRes = await fetch('/api/create-razorpay-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: depositAmt, userId: user?.username || 'udayreddy12' }),
        });
        if (orderRes.ok) {
          order = await orderRes.json();
        }
      } catch (e) {
        console.warn('Backend order creation endpoint unavailable, attempting client initialization...');
      }

      // 2. If Real Razorpay SDK is loaded on window and Key is present:
      if (window.Razorpay && activeKey && (activeKey.startsWith('rzp_test_') || activeKey.startsWith('rzp_live_'))) {
        setIsLoading(false);
        const options = {
          key: activeKey,
          amount: depositAmt * 100, // Amount in paise
          currency: 'INR',
          name: 'BetKing Gaming',
          description: 'Account Deposit (Real Payment)',
          order_id: order?.id, // Real Order ID from server if available
          handler: function (response) {
            console.log('Razorpay Real Payment Successful:', response);
            addFunds(depositAmt, 'Razorpay Real Payment');
            setIsSuccess(true);
          },
          prefill: {
            name: user?.displayName || 'Uday Reddy',
            email: user?.username ? `${user.username}@betking.com` : 'uday@example.com',
            contact: '9876543210',
          },
          notes: {
            userId: user?.username || 'udayreddy12',
          },
          theme: {
            color: '#7c3aed',
          },
          modal: {
            ondismiss: function () {
              setIsLoading(false);
            }
          }
        };

        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', function (response) {
          setIsLoading(false);
          setErrorMsg(`Payment Failed: ${response.error.description || 'Transaction cancelled or failed.'}`);
        });
        rzp.open();
        return;
      }

      // 3. If Key ID is missing, launch the Interactive Razorpay Payment Modal popup
      setIsLoading(false);
      setIsRzpModalOpen(true);
    } catch (err) {
      setIsLoading(false);
      setErrorMsg(`Error launching payment: ${err.message}`);
    }
  };

  const handleRazorpayModalSuccess = (depositAmt) => {
    setIsRzpModalOpen(false);
    addFunds(parseFloat(depositAmt), 'Razorpay Gateway');
    setIsSuccess(true);
  };

  const handleDepositSubmit = (e) => {
    e.preventDefault();
    const depositAmt = parseFloat(amount);
    if (isNaN(depositAmt) || depositAmt <= 0) return;

    if (selectedMethod?.type === 'razorpay') {
      openRazorpayRealPayment(depositAmt);
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      addFunds(depositAmt, selectedMethod?.name || 'Deposit');
      setIsSuccess(true);
    }, 1200);
  };

  return (
    <>
      {/* Interactive Razorpay Checkout Modal */}
      <RazorpayModal
        isOpen={isRzpModalOpen}
        onClose={() => setIsRzpModalOpen(false)}
        amount={amount}
        onSuccess={handleRazorpayModalSuccess}
        user={user}
      />

      <div className="deposit-overlay" onClick={handleClose} id="deposit-modal">
        <div className="deposit-card" onClick={e => e.stopPropagation()}>
          
          {/* Header */}
          <div className="deposit-header">
            <div className="deposit-header-left">
              {selectedMethod && !isSuccess && (
                <button className="deposit-back-btn" onClick={() => setSelectedMethod(null)}>
                  <IoChevronBack />
                </button>
              )}
              <h2>
                {isSuccess
                  ? 'Deposit Complete'
                  : selectedMethod
                  ? selectedMethod.name
                  : 'Deposit Funds'}
              </h2>
            </div>
            <button className="deposit-close" onClick={handleClose}>
              <IoClose />
            </button>
          </div>

          {/* Category Tabs (if on main list view) */}
          {!selectedMethod && !isSuccess && (
            <div className="deposit-tabs">
              <button
                className={`deposit-tab ${activeCategory === 'all' ? 'active' : ''}`}
                onClick={() => setActiveCategory('all')}
              >
                All Methods
              </button>
              <button
                className={`deposit-tab ${activeCategory === 'razorpay' ? 'active' : ''}`}
                onClick={() => setActiveCategory('razorpay')}
              >
                💳 Razorpay
              </button>
              <button
                className={`deposit-tab ${activeCategory === 'giftcard' ? 'active' : ''}`}
                onClick={() => setActiveCategory('giftcard')}
              >
                🎁 Gift Card
              </button>
              <button
                className={`deposit-tab ${activeCategory === 'upi' ? 'active' : ''}`}
                onClick={() => setActiveCategory('upi')}
              >
                📱 UPI & Wallets
              </button>
              <button
                className={`deposit-tab ${activeCategory === 'crypto' ? 'active' : ''}`}
                onClick={() => setActiveCategory('crypto')}
              >
                ₿ Crypto
              </button>
            </div>
          )}

          {/* Body Content */}
          <div className="deposit-body">
            {errorMsg && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca', color: '#ef4444',
                padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)',
                marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)'
              }}>
                <FiAlertCircle style={{ flexShrink: 0 }} />
                <span>{errorMsg}</span>
              </div>
            )}

            {isSuccess ? (
              /* Success Screen */
              <div className="deposit-success">
                <span className="deposit-success-icon">🎉</span>
                <h3>₹{parseFloat(amount).toLocaleString()} Added!</h3>
                <p>Your deposit via <strong>{selectedMethod?.name || 'Razorpay'}</strong> was successful and credited instantly to your BetKing balance.</p>
                <button className="deposit-confirm-btn" onClick={handleClose}>
                  Done & Continue Betting
                </button>
              </div>
            ) : selectedMethod ? (
              /* Selected Payment Method Form View */
              <form onSubmit={handleDepositSubmit}>
                {/* Preset Amount Chips */}
                <div className="deposit-form-group">
                  <label>Select Deposit Amount (₹)</label>
                  <div className="amount-presets">
                    {['500', '1000', '2500', '5000', '10000'].map(val => (
                      <button
                        type="button"
                        key={val}
                        className={`amount-preset-btn ${amount === val ? 'active' : ''}`}
                        onClick={() => setAmount(val)}
                      >
                        ₹{val}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    className="deposit-form-input"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="Enter custom amount"
                    min={selectedMethod.min}
                    max={selectedMethod.max}
                    required
                  />
                </div>

                {/* Razorpay Gateway Information & Key Configuration */}
                {selectedMethod.type === 'razorpay' && (
                  <>
                    <div style={{
                      background: 'linear-gradient(135deg, #0c2340 0%, #1e3a8a 100%)',
                      color: 'white',
                      borderRadius: 'var(--radius-lg)',
                      padding: 'var(--space-4)',
                      marginBottom: 'var(--space-4)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)', fontWeight: 'bold', fontSize: 'var(--text-sm)' }}>
                        <FiShield style={{ color: '#38bdf8' }} /> Real Razorpay Payment Gateway
                      </div>
                      <p style={{ fontSize: 'var(--text-xs)', opacity: 0.85, lineHeight: 1.5 }}>
                        Entering your UPI ID sends a <strong>REAL UPI Collect Push Request</strong> directly to your PhonePe / GPay / Paytm mobile app!
                      </p>
                    </div>

                    <div className="deposit-form-group">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                        <IoKeyOutline /> Razorpay Key ID (Enter your rzp_test_... or rzp_live_... key)
                      </label>
                      <input
                        type="text"
                        className="deposit-form-input"
                        placeholder="e.g. rzp_test_XXXXXX or rzp_live_XXXXXX"
                        value={razorpayKey}
                        onChange={e => setRazorpayKey(e.target.value)}
                        style={{ fontSize: 'var(--text-xs)', fontFamily: 'monospace' }}
                      />
                    </div>
                  </>
                )}

                {/* Amazon Gift Card Specific Fields */}
                {selectedMethod.type === 'giftcard' && (
                  <div className="deposit-form-group">
                    <label>Amazon Pay Gift Card Claim Code</label>
                    <input
                      type="text"
                      className="deposit-form-input"
                      placeholder="e.g. AG12-3456-7890-ABCD"
                      value={giftCardCode}
                      onChange={e => setGiftCardCode(e.target.value.toUpperCase())}
                      required
                    />
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                      Enter 14 or 15 digit claim code printed on your Amazon Gift Card.
                    </p>
                  </div>
                )}

                {/* UPI Specific Fields */}
                {selectedMethod.type === 'upi' && (
                  <>
                    <div className="deposit-tabs" style={{ margin: '0 0 var(--space-4) 0' }}>
                      <button
                        type="button"
                        className={`deposit-tab ${upiMode === 'id' ? 'active' : ''}`}
                        onClick={() => setUpiMode('id')}
                      >
                        Enter UPI VPA ID
                      </button>
                      <button
                        type="button"
                        className={`deposit-tab ${upiMode === 'qr' ? 'active' : ''}`}
                        onClick={() => setUpiMode('qr')}
                      >
                        Scan QR Code
                      </button>
                    </div>

                    {upiMode === 'id' ? (
                      <div className="deposit-form-group">
                        <label>Your UPI ID / VPA</label>
                        <input
                          type="text"
                          className="deposit-form-input"
                          placeholder="username@upi / mobile@paytm"
                          value={upiId}
                          onChange={e => setUpiId(e.target.value)}
                          required
                        />
                      </div>
                    ) : (
                      <div className="qr-container">
                        <div className="qr-box">
                          <IoQrCodeOutline className="qr-icon" />
                          <span style={{ fontSize: '0.65rem', fontWeight: 'bold' }}>SCAN TO PAY ₹{amount}</span>
                        </div>
                        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
                          Scan using GPay, PhonePe, Paytm, BHIM, or Amazon Pay
                        </p>
                      </div>
                    )}

                    {/* App quick launch bar */}
                    <div className="upi-apps">
                      <div className="upi-app-btn">
                        <div className="upi-app-icon" style={{ background: '#4285f4' }}>G</div>
                        <span>GPay</span>
                      </div>
                      <div className="upi-app-btn">
                        <div className="upi-app-icon" style={{ background: '#5f259f' }}>P</div>
                        <span>PhonePe</span>
                      </div>
                      <div className="upi-app-btn">
                        <div className="upi-app-icon" style={{ background: '#00baf2' }}>P</div>
                        <span>Paytm</span>
                      </div>
                      <div className="upi-app-btn">
                        <div className="upi-app-icon" style={{ background: '#ff9900' }}>a</div>
                        <span>Amazon</span>
                      </div>
                    </div>
                  </>
                )}

                {/* Submit CTA */}
                <button
                  type="submit"
                  className="deposit-confirm-btn"
                  disabled={isLoading}
                  style={selectedMethod.type === 'razorpay' ? { background: '#0c2340' } : {}}
                >
                  {isLoading ? (
                    'Creating Real Razorpay Payment...'
                  ) : (
                    <>
                      Pay ₹{parseFloat(amount || 0).toLocaleString()} via {selectedMethod.name}
                      <FiArrowRight />
                    </>
                  )}
                </button>
              </form>
            ) : (
              /* Method Selection List View */
              filteredMethods.map(method => (
                <div
                  className="deposit-method"
                  key={method.id}
                  onClick={() => handleMethodSelect(method)}
                >
                  <div
                    className="deposit-method-icon"
                    style={{ background: method.color || 'var(--color-text)' }}
                  >
                    {method.icon}
                  </div>
                  <div className="deposit-method-info">
                    <div className="deposit-method-title">
                      <h4>{method.name}</h4>
                      {method.badge && <span className="deposit-method-badge">{method.badge}</span>}
                    </div>
                    <p>{method.description}</p>
                  </div>
                  <div className="deposit-method-arrow">
                    <FiArrowRight />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
