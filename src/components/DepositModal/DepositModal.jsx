import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { IoClose, IoChevronBack, FiArrowRight, FiAlertCircle, FiCheck } from '../../icons';
import { useAuth } from '../../context/AuthContext';
import { MIN_DEPOSIT_INR, MAX_DEPOSIT_INR } from '../../utils/vipBenefits';
import RazorpayModal from '../RazorpayModal/RazorpayModal';
import { UpiLogo, GPayLogo, PhonePeLogo, PaytmLogo, BhimLogo } from '../PaymentLogos/PaymentLogos';
import RupeeSymbol from '../RupeeSymbol/RupeeSymbol';
import { apiFetch, fetchMe } from '../../utils/apiClient';
import './DepositModal.css';

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === '1' || import.meta.env.DEV;

async function waitForWalletCredit(refreshWallet, startBalance, attempts = 12) {
  for (let count = 0; count < attempts; count += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await refreshWallet?.();
    const me = await fetchMe().catch(() => null);
    if (me && Number(me.balance) > Number(startBalance) + 0.009) return true;
  }
  return false;
}

export default function DepositModal() {
  const { isDepositModalOpen, closeDepositModal, refreshWallet, user } = useAuth();
  const [amount, setAmount] = useState('1000');
  const [upiId, setUpiId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isRzpModalOpen, setIsRzpModalOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isDepositModalOpen) return null;

  const handleClose = () => {
    setIsSuccess(false);
    setIsLoading(false);
    setIsRzpModalOpen(false);
    setIsProcessing(false);
    setErrorMsg('');
    closeDepositModal();
  };

  const openRazorpayRealPayment = async (depositAmt) => {
    setErrorMsg('');
    setIsLoading(true);

    try {
      if (DEMO_MODE) {
        setIsLoading(false);
        setIsRzpModalOpen(true);
        return;
      }

      const orderRes = await apiFetch('/api/v1/payments/create-order', {
        method: 'POST',
        body: JSON.stringify({ amount: depositAmt, currency: 'INR' }),
      });
      const orderData = await orderRes.json();
      if (!orderRes.ok) {
        throw new Error(orderData.error || 'Unable to create deposit order');
      }

      const activeKey = orderData.keyId || import.meta.env.VITE_RAZORPAY_KEY_ID;
      if (!window.Razorpay || !activeKey) {
        throw new Error('Razorpay checkout is not available');
      }

      setIsLoading(false);
      const options = {
        key: activeKey,
        amount: depositAmt * 100,
        currency: 'INR',
        name: 'OddsYra Gaming',
        description: 'Account Deposit',
        order_id: orderData.orderId,
        handler: async function () {
          setIsProcessing(true);
          const startBalance = Number(user?.balance || 0);
          const credited = await waitForWalletCredit(refreshWallet, startBalance);
          setIsProcessing(false);
          if (credited) {
            setIsSuccess(true);
          } else {
            setErrorMsg('Payment submitted. Your wallet will update when the bank confirms it — this can take a minute.');
          }
        },
        prefill: {
          name: user?.displayName || '',
          email: user?.email || '',
          vpa: upiId.trim() || undefined,
        },
  theme: { color: '#1f8a4c' },
        modal: {
          ondismiss: function () {
            setIsLoading(false);
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (response) {
        setErrorMsg(`Payment failed: ${response.error.description || 'Transaction cancelled.'}`);
      });
      rzp.open();
    } catch (err) {
      setIsLoading(false);
      setErrorMsg(err.message || 'Unable to start payment');
    }
  };

  const handleRazorpayModalSuccess = () => {
    setIsRzpModalOpen(false);
    setIsSuccess(true);
    refreshWallet?.();
  };

  const handleDepositSubmit = (e) => {
    if (e) e.preventDefault();
    const depositAmt = parseFloat(amount);
    if (isNaN(depositAmt) || depositAmt < MIN_DEPOSIT_INR) {
      setErrorMsg(`Minimum deposit is ₹${MIN_DEPOSIT_INR.toLocaleString('en-IN')}.`);
      return;
    }
    if (depositAmt > MAX_DEPOSIT_INR) {
      setErrorMsg(`Maximum deposit is ₹${MAX_DEPOSIT_INR.toLocaleString('en-IN')}.`);
      return;
    }
    openRazorpayRealPayment(depositAmt);
  };

  return (
    <>
      {DEMO_MODE && (
        <RazorpayModal
          isOpen={isRzpModalOpen}
          onClose={() => setIsRzpModalOpen(false)}
          amount={amount}
          onSuccess={handleRazorpayModalSuccess}
          user={user}
        />
      )}

      <div className="deposit-overlay" onClick={handleClose} id="deposit-modal">
        <div className="deposit-card" onClick={(e) => e.stopPropagation()}>

          <div className="deposit-header">
            <div className="deposit-header-left">
              <h2>
                <span className="deposit-header-rupee"><RupeeSymbol size={22} /></span>
                {isSuccess ? 'Deposit Submitted' : 'Deposit Funds'}
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

          <div className="deposit-body">
            {errorMsg && (
              <div className="deposit-error-banner">
                <FiAlertCircle style={{ flexShrink: 0 }} />
                <span>{errorMsg}</span>
              </div>
            )}

            <AnimatePresence mode="wait">
              {isSuccess ? (
                <motion.div
                  key="success"
                  className="deposit-success"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <span className="deposit-success-icon">{isProcessing ? '⏳' : '🎉'}</span>
                  <h3>₹{parseFloat(amount).toLocaleString()} payment received</h3>
                  <p>
                    {isProcessing
                      ? 'Your wallet will update automatically once the payment is confirmed.'
                      : 'Your deposit has been credited to your OddsYra wallet.'}
                  </p>
                  <button type="button" className="deposit-pay-btn" onClick={handleClose}>
                    <FiCheck /> Done
                  </button>
                </motion.div>
              ) : (
                <motion.form
                  key="form"
                  onSubmit={handleDepositSubmit}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="amount-presets-label">
                    <span>Select Deposit Amount (₹)</span>
                  </div>

                  <div className="amount-presets-grid">
                    {['1000', '2500', '5000', '10000', '25000', '50000'].map((val) => (
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

                  <div className="deposit-input-wrap">
                    <span className="deposit-input-symbol">₹</span>
                    <input
                      type="number"
                      className="deposit-form-input"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="Minimum ₹1,000"
                      min={MIN_DEPOSIT_INR}
                      max={MAX_DEPOSIT_INR}
                      required
                    />
                  </div>

                  <div className="deposit-quick-apps-label">UPI apps</div>
                  <div className="deposit-quick-apps-bar">
                    <UpiLogo height={36} width={118} onClick={() => setUpiId('john@upi')} />
                    <GPayLogo height={36} width={118} onClick={() => setUpiId('john@okicici')} />
                    <PhonePeLogo height={36} width={118} onClick={() => setUpiId('john@ybl')} />
                    <PaytmLogo height={36} width={118} onClick={() => setUpiId('john@paytm')} />
                    <BhimLogo height={36} width={118} onClick={() => setUpiId('john@bhim')} />
                  </div>

                  <motion.button
                    type="submit"
                    className="deposit-pay-btn"
                    disabled={isLoading}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {isLoading ? 'Creating secure order…' : (
                      <>Pay ₹{parseFloat(amount || 0).toLocaleString()} via Razorpay <FiArrowRight /></>
                    )}
                  </motion.button>

                  <div className="deposit-trust-footer">
                    <span className="deposit-trust-item">🔒 SSL Encrypted</span>
                    <span>•</span>
                    <span className="deposit-trust-item">Webhook-verified credits</span>
                    <span>•</span>
                    <span className="deposit-trust-item">🛡️ Razorpay</span>
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
