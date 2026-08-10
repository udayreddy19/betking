import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { IoClose, IoChevronBack, IoKeyOutline, FiArrowRight, FiShield, FiAlertCircle, FiZap, FiCheck } from '../../icons';
import { useAuth } from '../../context/AuthContext';
import { paymentMethods } from '../../data/mockData';
import RazorpayModal from '../RazorpayModal/RazorpayModal';
import { UpiLogo, GPayLogo, PhonePeLogo, PaytmLogo, BhimLogo } from '../PaymentLogos/PaymentLogos';
import RupeeSymbol from '../RupeeSymbol/RupeeSymbol';
import './DepositModal.css';

export default function DepositModal() {
  const { isDepositModalOpen, closeDepositModal, addFunds, user } = useAuth();
  const [selectedMethod, setSelectedMethod] = useState(null);

  // Form states
  const [amount, setAmount] = useState('1000');
  const [giftCardCode, setGiftCardCode] = useState('');
  const [upiId, setUpiId] = useState('john@upi');
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

  const openRazorpayRealPayment = async (depositAmt) => {
    setErrorMsg('');
    setIsLoading(true);

    const activeKey = razorpayKey.trim() || import.meta.env.VITE_RAZORPAY_KEY_ID;

    try {
      let order = null;
      try {
        const orderRes = await fetch('/api/create-razorpay-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: depositAmt, userId: user?.email || 'guest' }),
        });
        if (orderRes.ok) {
          order = await orderRes.json();
        }
      } catch {
        console.warn('Backend order creation endpoint unavailable, attempting client initialization...');
      }

      if (window.Razorpay && activeKey && (activeKey.startsWith('rzp_test_') || activeKey.startsWith('rzp_live_'))) {
        setIsLoading(false);
        const options = {
          key: activeKey,
          amount: depositAmt * 100,
          currency: 'INR',
          name: 'BetKing Gaming',
          description: 'Account Deposit (UPI Push Collect)',
          order_id: order?.id,
          handler: function (response) {
            console.log('Razorpay Real Payment Successful:', response);
            addFunds(depositAmt, 'Razorpay Real Payment');
            setIsSuccess(true);
          },
          prefill: {
            name: user?.displayName || 'John Doe',
            email: user?.username ? `${user.username}@betking.com` : 'uday@example.com',
            contact: '9876543210',
            vpa: upiId.trim() || 'udayreddy@okicici',
          },
          theme: { color: '#7c3aed' },
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
    if (e) e.preventDefault();
    const depositAmt = parseFloat(amount);
    if (isNaN(depositAmt) || depositAmt <= 0) return;

    openRazorpayRealPayment(depositAmt);
  };

  const currentBonusAmount = (parseFloat(amount || 0) * 1).toLocaleString();

  return (
    <>
      <RazorpayModal
        isOpen={isRzpModalOpen}
        onClose={() => setIsRzpModalOpen(false)}
        amount={amount}
        onSuccess={handleRazorpayModalSuccess}
        user={user}
      />

      <div className="deposit-overlay" onClick={handleClose} id="deposit-modal">
        <div className="deposit-card" onClick={(e) => e.stopPropagation()}>

          {/* Header */}
          <div className="deposit-header">
            <div className="deposit-header-left">
              {selectedMethod && !isSuccess && (
                <motion.button
                  type="button"
                  className="deposit-back-btn"
                  onClick={() => setSelectedMethod(null)}
                  whileHover={{ scale: 1.08, x: -2 }}
                  whileTap={{ scale: 0.92 }}
                >
                  <IoChevronBack />
                </motion.button>
              )}
              <h2>
                <span className="deposit-header-rupee"><RupeeSymbol size={22} /></span>
                {isSuccess
                  ? 'Deposit Complete'
                  : selectedMethod
                    ? selectedMethod.name
                    : 'Deposit Funds'}
              </h2>
            </div>
            <motion.button
              type="button"
              className="deposit-close"
              onClick={handleClose}
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
            >
              <IoClose />
            </motion.button>
          </div>

          {/* Body Content */}
          <div className="deposit-body">
            {errorMsg && (
              <div style={{
                background: '#fef2f2', border: '1px solid #fecaca', color: '#ef4444',
                padding: '10px 14px', borderRadius: '12px', fontSize: '0.8rem',
                marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px'
              }}>
                <FiAlertCircle style={{ flexShrink: 0 }} />
                <span>{errorMsg}</span>
              </div>
            )}

            <AnimatePresence mode="wait">
              {isSuccess ? (
                /* Success View */
                <motion.div
                  key="success"
                  className="deposit-success"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <span className="deposit-success-icon">🎉</span>
                  <h3>₹{parseFloat(amount).toLocaleString()} Added!</h3>
                  <p>Your deposit was processed successfully and credited instantly to your BetKing balance.</p>
                  <button type="button" className="deposit-pay-btn" onClick={handleClose}>
                    <FiCheck /> Done & Continue Betting
                  </button>
                </motion.div>
              ) : (
                /* Main Deposit Form View */
                <motion.form
                  key="form"
                  onSubmit={handleDepositSubmit}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {/* Preset Amount Chips */}
                  <div className="amount-presets-label">
                    <span>Select Deposit Amount (₹)</span>
                  </div>

                  <div className="amount-presets-grid">
                    {['500', '1000', '2500', '5000', '10000', '25000'].map((val) => (
                      <button
                        type="button"
                        key={val}
                        className={`amount-preset-chip ${amount === val ? 'active' : ''}`}
                        onClick={() => setAmount(val)}
                      >
                        <span>₹{parseFloat(val).toLocaleString()}</span>
                      </button>
                    ))}
                  </div>

                  {/* Custom Amount Input */}
                  <div className="deposit-input-wrap">
                    <span className="deposit-input-symbol">₹</span>
                    <input
                      type="number"
                      className="deposit-form-input"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="Enter custom deposit amount"
                      min="100"
                      max="100000"
                      required
                    />
                  </div>

                  {/* Quick UPI Launcher Apps */}
                  <div className="deposit-quick-apps-label">Fast UPI VPA Fill / Instant Apps</div>
                  <div className="deposit-quick-apps-bar">
                    <UpiLogo height={32} width={95} onClick={() => setUpiId('john@upi')} />
                    <GPayLogo height={32} width={95} onClick={() => setUpiId('john@okicici')} />
                    <PhonePeLogo height={32} width={95} onClick={() => setUpiId('john@ybl')} />
                    <PaytmLogo height={32} width={95} onClick={() => setUpiId('john@paytm')} />
                    <BhimLogo height={32} width={95} onClick={() => setUpiId('john@bhim')} />
                  </div>

                  {/* Submit CTA */}
                  <motion.button
                    type="submit"
                    className="deposit-pay-btn"
                    disabled={isLoading}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {isLoading ? (
                      'Connecting to Razorpay Gateway...'
                    ) : (
                      <>
                        Pay ₹{parseFloat(amount || 0).toLocaleString()} via Razorpay
                        <FiArrowRight />
                      </>
                    )}
                  </motion.button>

                  {/* Trust Footer */}
                  <div className="deposit-trust-footer">
                    <span className="deposit-trust-item">🔒 256-Bit SSL Encrypted</span>
                    <span>•</span>
                    <span className="deposit-trust-item">⚡ Instant Auto Credit</span>
                    <span>•</span>
                    <span className="deposit-trust-item">🛡️ Razorpay Verified</span>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </>
  );
}
