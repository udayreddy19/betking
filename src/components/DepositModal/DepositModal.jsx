import { useState, useEffect } from 'react';
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

function loadCashfreeSdk() {
  return new Promise((resolve, reject) => {
    if (window.Cashfree) return resolve(window.Cashfree);
    const existing = document.getElementById('cashfree-sdk-script');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.Cashfree));
      existing.addEventListener('error', reject);
      return;
    }
    const script = document.createElement('script');
    script.id = 'cashfree-sdk-script';
    script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
    script.async = true;
    script.onload = () => resolve(window.Cashfree);
    script.onerror = () => reject(new Error('Failed to load Cashfree SDK'));
    document.head.appendChild(script);
  });
}

export default function DepositModal() {
  const { isDepositModalOpen, closeDepositModal, refreshWallet, addFunds, user } = useAuth();
  const navigate = useNavigate();
  const [amount, setAmount] = useState('1000');
  const [selectedProvider, setSelectedProvider] = useState('CASHFREE');
  const [availableProviders, setAvailableProviders] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isRzpModalOpen, setIsRzpModalOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (!isDepositModalOpen) return;
    let cancelled = false;
    apiFetch('/api/v1/payments/providers')
      .then(res => res.json())
      .then(data => {
        if (!cancelled && data?.providers) {
          setAvailableProviders(data.providers);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isDepositModalOpen]);

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

  const openCashfreePayment = async (depositAmt) => {
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
        body: JSON.stringify({ amount: depositAmt, currency: 'INR', provider: 'CASHFREE' }),
      });
      const orderData = await orderRes.json();
      if (!orderRes.ok) {
        const apiError = orderData.error || orderData.code || 'Unable to create Cashfree deposit order';
        throw new Error(apiError);
      }

      if (!orderData.paymentSessionId) {
        throw new Error('Cashfree payment session missing from server response');
      }

      const CashfreeSdk = await loadCashfreeSdk();
      const cashfree = new CashfreeSdk({
        mode: orderData.environment === 'production' ? 'production' : 'sandbox',
      });

      setIsLoading(false);

      const checkoutOptions = {
        paymentSessionId: orderData.paymentSessionId,
        redirectTarget: '_modal',
      };

      try {
        await cashfree.checkout(checkoutOptions);
      } catch (cfUiErr) {
        logger.warn('Cashfree checkout modal note:', cfUiErr);
      }

      // Check and verify with server
      setIsProcessing(true);
      const startBalance = Number(user?.balance || 0);

      try {
        const verifyRes = await apiFetch('/api/v1/payments/cashfree/verify', {
          method: 'POST',
          body: JSON.stringify({
            orderId: orderData.orderId,
            depositId: orderData.depositId,
            provider: 'CASHFREE',
          }),
        });
        const verifyData = await verifyRes.json().catch(() => ({}));
        if (verifyRes.ok && verifyData.success) {
          await refreshWallet?.();
          setIsSuccess(true);
        } else {
          const credited = await waitForWalletCredit(refreshWallet, startBalance);
          if (credited) {
            setIsSuccess(true);
          } else {
            setErrorMsg(verifyData.error || 'Payment was not confirmed. If debited, your wallet will update shortly.');
          }
        }
      } catch (err) {
        const credited = await waitForWalletCredit(refreshWallet, startBalance);
        if (credited) {
          setIsSuccess(true);
        } else {
          setErrorMsg('Payment verification in progress. Please check your transaction history.');
        }
      } finally {
        setIsProcessing(false);
      }
    } catch (err) {
      setIsLoading(false);
      setIsProcessing(false);
      setErrorMsg(err.message || 'Unable to start Cashfree payment');
    }
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
        body: JSON.stringify({ amount: depositAmt, currency: 'INR', provider: 'RAZORPAY' }),
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

      const amountPaise = Number(orderData.amountPaise)
        || Math.round(Number(orderData.amount || depositAmt) * 100);

      setIsLoading(false);
      const options = {
        key: activeKey,
        amount: amountPaise,
        currency: orderData.currency || 'INR',
        name: 'ReconcileX',
        description: 'Account Deposit / Service Credits',
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
        theme: { color: '#2563eb' },
        modal: {
          ondismiss: function () {
            setIsLoading(false);
            setIsProcessing(false);
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (response) {
        setIsProcessing(false);
        setErrorMsg(`Payment failed: ${response.error?.description || 'Transaction cancelled.'}`);
      });
      rzp.open();
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
      await addFunds?.(amt, selectedProvider);
    } else {
      await refreshWallet?.();
    }
    setIsSuccess(true);
  };

  const handleDepositSubmit = (e) => {
    if (e) e.preventDefault();
    setErrorMsg('');
    const depositAmt = parseFloat(amount);

    if (isNaN(depositAmt) || depositAmt <= 0) {
      setErrorMsg('Please enter a valid amount.');
      return;
    }
    if (depositAmt < MIN_DEPOSIT_INR) {
      setErrorMsg(`Minimum deposit amount is ₹${MIN_DEPOSIT_INR.toLocaleString('en-IN')}.`);
      return;
    }
    if (depositAmt > MAX_DEPOSIT_INR) {
      setErrorMsg(`Maximum deposit amount is ₹${MAX_DEPOSIT_INR.toLocaleString('en-IN')}.`);
      return;
    }

    if (selectedProvider === 'CASHFREE') {
      openCashfreePayment(depositAmt);
    } else {
      openRazorpayRealPayment(depositAmt);
    }
  };

  return (
    <>
      <RazorpayModal
        isOpen={isRzpModalOpen}
        onClose={() => setIsRzpModalOpen(false)}
        amount={amount}
        onSuccess={handleRazorpayModalSuccess}
        user={user}
      />

      <div className="deposit-modal-overlay" onClick={handleClose}>
        <div
          className="deposit-modal-card"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="deposit-modal-title"
        >
          <div className="deposit-modal-header">
            <div className="deposit-modal-title-wrap">
              <h2 id="deposit-modal-title">Add Funds</h2>
              <span className="deposit-modal-badge">Instant Deposit</span>
            </div>
            <button
              type="button"
              className="deposit-close-btn"
              onClick={handleClose}
              aria-label="Close"
            >
              <IoClose />
            </button>
          </div>

          <div className="deposit-modal-body">
            {bannerText && (
              <div
                className={`deposit-kyc-banner ${isKycError(errorMsg) ? 'deposit-kyc-banner--error' : 'deposit-kyc-banner--info'}`}
                role="status"
              >
                <FiAlertCircle className="deposit-kyc-icon" aria-hidden="true" />
                <span className="deposit-kyc-text">{bannerText}</span>
                {showKycCta && (
                  <button type="button" className="deposit-kyc-cta" onClick={goToKyc}>
                    Complete KYC
                  </button>
                )}
              </div>
            )}

            <AnimatePresence mode="wait">
              {isSuccess ? (
                <motion.div
                  key="success"
                  className="deposit-success-view"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="deposit-success-icon-wrap">
                    <FiCheck />
                  </div>
                  <h3>Deposit Successful!</h3>
                  <p className="deposit-success-amount">
                    <RupeeSymbol size={20} />
                    {parseFloat(amount || 0).toLocaleString('en-IN')} credited to your wallet
                  </p>
                  <p className="deposit-success-sub">
                    Funds are immediately available for sports selections.
                  </p>
                  <button
                    type="button"
                    className="deposit-done-btn"
                    onClick={handleClose}
                  >
                    Start Betting
                  </button>
                </motion.div>
              ) : isProcessing ? (
                <motion.div
                  key="processing"
                  className="deposit-processing-view"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <div className="deposit-spinner" />
                  <h3>Verifying Payment</h3>
                  <p>
                    Please wait while we confirm your transaction and credit your wallet.
                  </p>
                </motion.div>
              ) : (
                <motion.form
                  key="form"
                  className="deposit-form"
                  onSubmit={handleDepositSubmit}
                  noValidate
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {/* Gateway selector if multiple available */}
                  <div className="deposit-provider-selector">
                    <span className="provider-selector-label">Payment Gateway</span>
                    <div className="provider-selector-tabs">
                      <button
                        type="button"
                        className={`provider-tab ${selectedProvider === 'CASHFREE' ? 'active' : ''}`}
                        onClick={() => setSelectedProvider('CASHFREE')}
                      >
                        ⚡ Cashfree Payments
                      </button>
                      <button
                        type="button"
                        className={`provider-tab ${selectedProvider === 'RAZORPAY' ? 'active' : ''}`}
                        onClick={() => setSelectedProvider('RAZORPAY')}
                      >
                        🛡️ Razorpay
                      </button>
                    </div>
                  </div>

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

                  <div className="deposit-quick-apps-label">Supported UPI & Instant Methods</div>
                  <div className="deposit-quick-apps-bar">
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
                    <span className="deposit-trust-item">🔒 256-bit SSL</span>
                    <span>•</span>
                    <span className="deposit-trust-item">Instant Verified Credit</span>
                    <span>•</span>
                    <span className="deposit-trust-item">{selectedProvider === 'CASHFREE' ? '⚡ Cashfree PG' : '🛡️ Razorpay PG'}</span>
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
