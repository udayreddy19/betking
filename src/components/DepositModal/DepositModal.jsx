import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { IoClose, FiArrowRight, FiAlertCircle, FiCheck } from '../../icons';
import { useAuth } from '../../context/AuthContext';
import { MIN_DEPOSIT_INR, MAX_DEPOSIT_INR } from '../../utils/vipBenefits';
import RazorpayModal from '../RazorpayModal/RazorpayModal';
import { UpiLogo, GPayLogo, PhonePeLogo, PaytmLogo, BhimLogo } from '../PaymentLogos/PaymentLogos';
import RupeeSymbol from '../RupeeSymbol/RupeeSymbol';
import { apiFetch, fetchMe } from '../../utils/apiClient';
import { DEMO_MODE } from '../../utils/featureFlags';
import { cleanKycMessage, isKycError, KYC_PROFILE_PATH } from '../../utils/kycUi';
import './DepositModal.css';

async function waitForWalletCredit(refreshWallet, startBalance, attempts = 8) {
  for (let count = 0; count < attempts; count += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await refreshWallet?.();
    const me = await fetchMe().catch(() => null);
    if (me && Number(me.balance) > Number(startBalance) + 0.009) return true;
  }
  return false;
}

export default function DepositModal() {
  const { isDepositModalOpen, closeDepositModal, refreshWallet, addFunds, user } = useAuth();
  const navigate = useNavigate();
  const [amount, setAmount] = useState('1000');
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

  const goToKyc = () => {
    handleClose();
    navigate(KYC_PROFILE_PATH);
  };

  const kycIncomplete = String(user?.kycStatus || '').toUpperCase() !== 'VERIFIED';
  const isKycBanner = isKycError(errorMsg) || (!errorMsg && kycIncomplete && !isSuccess && !isProcessing);
  const bannerText = isKycError(errorMsg)
    ? cleanKycMessage(errorMsg)
    : (errorMsg || (kycIncomplete && !isSuccess && !isProcessing
      ? 'Verify your identity (KYC) before withdrawing winnings.'
      : ''));
  const showKycCta = isKycBanner;

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
        const apiError = orderData.error || orderData.code || 'Unable to create deposit order';
        throw new Error(apiError);
      }

      const activeKey = orderData.keyId || import.meta.env.VITE_RAZORPAY_KEY_ID;
      if (!window.Razorpay || !activeKey) {
        throw new Error('Razorpay checkout is not available');
      }

      // Razorpay Checkout expects amount in paise. Server returns rupees (+ amountPaise).
      const amountPaise = Number(orderData.amountPaise)
        || Math.round(Number(orderData.amount || depositAmt) * 100);

      setIsLoading(false);
      // Never prefill email/phone/VPA — Safari throws
      // "The string did not match the expected pattern" for .local emails / bad VPAs,
      // and Razorpay Checkout validates prefill strictly.
      const options = {
        key: activeKey,
        amount: amountPaise,
        currency: orderData.currency || 'INR',
        name: 'OddsYra Gaming',
        description: 'Account Deposit',
        order_id: orderData.orderId,
        handler: async function (response) {
          setIsProcessing(true);
          setErrorMsg('');
          const startBalance = Number(user?.balance || 0);
          try {
            const confirmRes = await apiFetch('/api/v1/payments/confirm', {
              method: 'POST',
              body: JSON.stringify({
                razorpay_order_id: response?.razorpay_order_id || orderData.orderId,
                razorpay_payment_id: response?.razorpay_payment_id,
                razorpay_signature: response?.razorpay_signature,
              }),
            });
            const confirmData = await confirmRes.json().catch(() => ({}));
            if (!confirmRes.ok) {
              throw new Error(confirmData.error || confirmData.code || 'Could not confirm payment');
            }
            await refreshWallet?.();
            setIsSuccess(true);
          } catch (confirmErr) {
            const credited = await waitForWalletCredit(refreshWallet, startBalance);
            if (credited) {
              setIsSuccess(true);
            } else {
              setErrorMsg(
                confirmErr.message
                || 'Payment submitted. Your wallet will update when confirmation completes.',
              );
            }
          } finally {
            setIsProcessing(false);
          }
        },
        theme: { color: '#1f8a4c' },
        modal: {
          ondismiss: function () {
            setIsLoading(false);
            setIsProcessing(false);
          },
        },
      };

      if (!orderData.orderId || !String(orderData.orderId).startsWith('order_')) {
        throw new Error('Invalid payment order from server. Please try again.');
      }

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (response) {
        setIsProcessing(false);
        setErrorMsg(`Payment failed: ${response.error?.description || 'Transaction cancelled.'}`);
      });
      try {
        rzp.open();
      } catch (openErr) {
        const msg = String(openErr?.message || openErr || '');
        if (/expected pattern|pattern/i.test(msg)) {
          throw new Error('Could not open Razorpay Checkout. Refresh the page and try again.');
        }
        throw openErr;
      }
    } catch (err) {
      setIsLoading(false);
      setIsProcessing(false);
      setErrorMsg(err.message || 'Unable to start payment');
    }
  };

  const handleRazorpayModalSuccess = async () => {
    setIsRzpModalOpen(false);
    const amt = parseFloat(amount);
    if (DEMO_MODE && Number.isFinite(amt) && amt > 0) {
      await addFunds?.(amt, 'Razorpay');
    } else {
      await refreshWallet?.();
    }
    setIsSuccess(true);
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
            {bannerText && (
              <div className={`deposit-error-banner${isKycBanner ? ' deposit-error-banner--kyc' : ''}`}>
                <FiAlertCircle style={{ flexShrink: 0 }} />
                <div className="deposit-error-banner-copy">
                  <span>{bannerText}</span>
                  {showKycCta && (
                    <button type="button" className="deposit-kyc-cta" onClick={goToKyc}>
                      Proceed to KYC <FiArrowRight />
                    </button>
                  )}
                </div>
              </div>
            )}

            <AnimatePresence mode="wait">
              {isSuccess || isProcessing ? (
                <motion.div
                  key="success"
                  className="deposit-success"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <span className="deposit-success-icon">{isProcessing ? '⏳' : '🎉'}</span>
                  <h3>
                    {isProcessing
                      ? 'Confirming your payment…'
                      : `₹${parseFloat(amount).toLocaleString()} payment received`}
                  </h3>
                  <p>
                    {isProcessing
                      ? 'Please wait while we verify with Razorpay and credit your wallet.'
                      : 'Your deposit has been credited to your OddsYra wallet.'}
                  </p>
                  {!isProcessing && (
                    <button type="button" className="deposit-pay-btn" onClick={handleClose}>
                      <FiCheck /> Done
                    </button>
                  )}
                </motion.div>
              ) : (
                <motion.form
                  key="form"
                  onSubmit={handleDepositSubmit}
                  noValidate
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
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      className="deposit-form-input"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
                      placeholder="Minimum ₹1,000"
                    />
                  </div>

                  <div className="deposit-quick-apps-label">UPI apps</div>
                  <div className="deposit-quick-apps-bar">
                    {/* Logos are visual only — do not prefill fake VPAs (Safari/Razorpay reject them). */}
                    <UpiLogo height={36} width={118} />
                    <GPayLogo height={36} width={118} />
                    <PhonePeLogo height={36} width={118} />
                    <PaytmLogo height={36} width={118} />
                    <BhimLogo height={36} width={118} />
                  </div>

                  <motion.button
                    type="submit"
                    className="deposit-pay-btn"
                    disabled={isLoading}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {isLoading ? 'Creating secure order…' : (
                      <>Pay ₹{parseFloat(amount || 0).toLocaleString()} <FiArrowRight /></>
                    )}
                  </motion.button>

                  <div className="deposit-trust-footer">
                    <span className="deposit-trust-item">🔒 SSL Encrypted</span>
                    <span>•</span>
                    <span className="deposit-trust-item">Webhook-verified credits</span>
                    <span>•</span>
                    <span className="deposit-trust-item">🛡️ Razorpay</span>
                  </div>
                  <p className="deposit-wager-note">
                    Deposited funds must be wagered once before they can be withdrawn.
                  </p>
                </motion.form>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </>
  );
}
