import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  FiArrowLeft,
  FiCheck,
  FiAlertCircle,
  FiChevronDown,
  FiChevronUp,
  FiLock,
  FiShield,
  FiZap,
} from '../../icons';
import { useAuth } from '../../context/AuthContext';
import { MIN_DEPOSIT_INR, MAX_DEPOSIT_INR } from '../../utils/vipBenefits';
import { apiFetch, fetchMe } from '../../utils/apiClient';
import { formatInr } from '../../utils/walletBalance';
import { DEMO_MODE } from '../../utils/featureFlags';
import { cleanKycMessage, isKycError, KYC_PROFILE_PATH } from '../../utils/kycUi';
import RazorpayModal from '../RazorpayModal/RazorpayModal';
import './DepositView.css';

const QUICK_AMOUNTS = [1000, 2500, 5000, 10000, 25000, 50000];

const PAYMENT_METHODS = [
  {
    id: 'upi',
    name: 'Instant UPI',
    subtitle: 'Google Pay • PhonePe • Paytm • BHIM',
    badge: 'Fastest',
    icon: '⚡',
  },
  {
    id: 'cards',
    name: 'Debit & Credit Cards',
    subtitle: 'Visa • MasterCard • RuPay',
    icon: '💳',
  },
  {
    id: 'netbanking',
    name: 'Net Banking',
    subtitle: 'SBI, HDFC, ICICI, Axis & 50+ Banks',
    icon: '🏦',
  },
];

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

function loadRazorpaySdk() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve(window.Razorpay);
    const existing = document.getElementById('razorpay-checkout-script');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.Razorpay));
      existing.addEventListener('error', reject);
      return;
    }
    const script = document.createElement('script');
    script.id = 'razorpay-checkout-script';
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(window.Razorpay);
    script.onerror = () => reject(new Error('Failed to load Razorpay checkout'));
    document.head.appendChild(script);
  });
}

export default function DepositView({ onClose, isModal = false, returnTo = null }) {
  const { user, refreshWallet, addFunds } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [amountStr, setAmountStr] = useState('1000');
  const [selectedMethod, setSelectedMethod] = useState('upi');
  const [selectedProvider, setSelectedProvider] = useState('CASHFREE');
  const [availableProviders, setAvailableProviders] = useState([]);
  const [paymentsAvailable, setPaymentsAvailable] = useState(true);
  const [allowUserSelection, setAllowUserSelection] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isRzpModalOpen, setIsRzpModalOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [showTxDetails, setShowTxDetails] = useState(false);
  const [lastTransaction, setLastTransaction] = useState(null);

  const inputRef = useRef(null);
  const submitLockRef = useRef(false);

  // Auto-focus input on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  // Fetch gateway configuration
  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/v1/payments/providers')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          setPaymentsAvailable(data.paymentsAvailable !== false);
          setAvailableProviders(data.providers || []);
          setAllowUserSelection(Boolean(data.allowUserSelection));
          const primary = data.primaryProvider || data.defaultProvider || 'CASHFREE';
          setSelectedProvider(primary);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Numeric sanitization
  const handleAmountChange = (e) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    setErrorMsg('');
    if (raw === '') {
      setAmountStr('');
      return;
    }
    const num = parseInt(raw, 10);
    if (!Number.isNaN(num)) {
      if (num > MAX_DEPOSIT_INR) {
        setAmountStr(String(MAX_DEPOSIT_INR));
        setErrorMsg(`Maximum deposit limit is ${formatInr(MAX_DEPOSIT_INR)}.`);
      } else {
        setAmountStr(String(num));
      }
    }
  };

  const parsedAmount = parseInt(amountStr, 10) || 0;
  const isAmountValid = parsedAmount >= MIN_DEPOSIT_INR && parsedAmount <= MAX_DEPOSIT_INR;

  const handleQuickAmount = (val) => {
    setAmountStr(String(val));
    setErrorMsg('');
    inputRef.current?.focus();
  };

  // Smart return navigation
  const effectiveReturnTo = useMemo(() => {
    if (returnTo) return returnTo;
    if (location.state?.returnTo) return location.state.returnTo;
    const referrer = document.referrer;
    if (referrer && referrer.includes(window.location.origin)) {
      try {
        const path = new URL(referrer).pathname;
        if (path && path !== '/wallet/deposit' && path !== '/deposit') return path;
      } catch {}
    }
    return '/sports';
  }, [returnTo, location.state]);

  const handleBack = () => {
    if (onClose) {
      onClose();
    } else {
      navigate(effectiveReturnTo || '/sports');
    }
  };

  const handleContinueAfterSuccess = () => {
    if (onClose) {
      onClose();
    }
    navigate(effectiveReturnTo || '/sports');
  };

  const handleViewHistory = () => {
    if (onClose) onClose();
    navigate('/wallet');
  };

  // Cashfree checkout
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
        throw new Error(orderData.error || orderData.code || 'Unable to create Cashfree deposit order');
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
        console.warn('Cashfree checkout modal note:', cfUiErr);
      }

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
          setLastTransaction({
            amount: depositAmt,
            orderId: orderData.orderId || orderData.depositId,
            method: PAYMENT_METHODS.find((m) => m.id === selectedMethod)?.name || 'UPI',
            date: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
          });
          setIsSuccess(true);
        } else {
          const credited = await waitForWalletCredit(refreshWallet, startBalance);
          if (credited) {
            setLastTransaction({
              amount: depositAmt,
              orderId: orderData.orderId || orderData.depositId,
              method: PAYMENT_METHODS.find((m) => m.id === selectedMethod)?.name || 'UPI',
              date: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
            });
            setIsSuccess(true);
          } else {
            setErrorMsg(verifyData.error || 'Payment confirmation pending. Wallet will update shortly.');
          }
        }
      } catch (err) {
        const credited = await waitForWalletCredit(refreshWallet, startBalance);
        if (credited) {
          setLastTransaction({
            amount: depositAmt,
            orderId: orderData.orderId || orderData.depositId,
            method: PAYMENT_METHODS.find((m) => m.id === selectedMethod)?.name || 'UPI',
            date: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
          });
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

  // Razorpay checkout
  const openRazorpayPayment = async (depositAmt) => {
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
        throw new Error(orderData.error || orderData.code || 'Unable to create deposit order');
      }

      const activeKey = orderData.keyId || import.meta.env.VITE_RAZORPAY_KEY_ID;
      await loadRazorpaySdk();
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
        name: 'OddsYra',
        description: 'Account Deposit / Wallet Credits',
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
            setLastTransaction({
              amount: depositAmt,
              orderId: response?.razorpay_payment_id || orderData.orderId,
              method: PAYMENT_METHODS.find((m) => m.id === selectedMethod)?.name || 'UPI',
              date: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
            });
            setIsSuccess(true);
          } catch (confirmErr) {
            const credited = await waitForWalletCredit(refreshWallet, startBalance);
            if (credited) {
              setLastTransaction({
                amount: depositAmt,
                orderId: response?.razorpay_payment_id || orderData.orderId,
                method: PAYMENT_METHODS.find((m) => m.id === selectedMethod)?.name || 'UPI',
                date: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
              });
              setIsSuccess(true);
            } else {
              setErrorMsg(confirmErr.message || 'Payment submitted. Wallet will update when verified.');
            }
          } finally {
            setIsProcessing(false);
          }
        },
        theme: { color: '#10b981' },
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
    if (DEMO_MODE && parsedAmount > 0) {
      await addFunds?.(parsedAmount, selectedProvider);
    } else {
      await refreshWallet?.();
    }
    setLastTransaction({
      amount: parsedAmount,
      orderId: `DEMO_${Date.now().toString(36).toUpperCase()}`,
      method: PAYMENT_METHODS.find((m) => m.id === selectedMethod)?.name || 'UPI',
      date: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
    });
    setIsSuccess(true);
  };

  const handleDepositSubmit = async (e) => {
    if (e) e.preventDefault();
    if (submitLockRef.current || isLoading || isProcessing) return;

    if (!isAmountValid) {
      if (parsedAmount < MIN_DEPOSIT_INR) {
        setErrorMsg(`Minimum deposit is ${formatInr(MIN_DEPOSIT_INR)}.`);
      } else {
        setErrorMsg(`Maximum deposit is ${formatInr(MAX_DEPOSIT_INR)}.`);
      }
      return;
    }

    submitLockRef.current = true;
    try {
      if (selectedProvider === 'RAZORPAY') {
        await openRazorpayPayment(parsedAmount);
      } else {
        await openCashfreePayment(parsedAmount);
      }
    } finally {
      submitLockRef.current = false;
    }
  };

  const kycIncomplete = String(user?.kycStatus || '').toUpperCase() !== 'VERIFIED';
  const isKycBanner = isKycError(errorMsg) || (!errorMsg && kycIncomplete && !isSuccess && !isProcessing);
  const bannerText = isKycError(errorMsg)
    ? cleanKycMessage(errorMsg)
    : (errorMsg || '');

  return (
    <div className={`deposit-flow-wrapper ${isModal ? 'deposit-flow-wrapper--modal' : ''}`}>
      {/* Demo Gateway fallback modal */}
      {isRzpModalOpen && (
        <RazorpayModal
          amount={parsedAmount}
          onSuccess={handleRazorpayModalSuccess}
          onClose={() => setIsRzpModalOpen(false)}
        />
      )}

      {/* Header */}
      <header className="deposit-flow-header">
        <button
          type="button"
          className="deposit-back-btn"
          onClick={handleBack}
          aria-label="Go back"
        >
          <FiArrowLeft size={20} />
        </button>

        <div className="deposit-header-titles">
          <h1 className="deposit-title">Add Funds</h1>
          <p className="deposit-subtitle">Add money securely to your wallet</p>
        </div>

        <div className="deposit-header-badge" title="256-bit SSL Bank Grade Security">
          <FiLock size={13} className="deposit-lock-icon" />
          <span>SSL Secured</span>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="deposit-flow-content">
        <AnimatePresence mode="wait">
          {/* 1. SUCCESS VIEW */}
          {isSuccess ? (
            <motion.div
              key="success"
              className="deposit-success-card"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <div className="deposit-success-badge-wrap">
                <div className="deposit-success-ring" />
                <div className="deposit-success-check">
                  <FiCheck size={28} />
                </div>
              </div>

              <h2 className="deposit-success-title">Deposit Successful</h2>
              <p className="deposit-success-amount">
                {formatInr(lastTransaction?.amount || parsedAmount)} added successfully
              </p>
              <p className="deposit-success-desc">
                Your funds are now available in your wallet.
              </p>

              {/* Balance Card */}
              <div className="deposit-wallet-balance-box">
                <span className="balance-box-label">CURRENT WALLET BALANCE</span>
                <span className="balance-box-amount">{formatInr(user?.balance || 0)}</span>
              </div>

              {/* Collapsible Transaction Details */}
              <div className="deposit-tx-accordion">
                <button
                  type="button"
                  className="deposit-tx-toggle"
                  onClick={() => setShowTxDetails(!showTxDetails)}
                >
                  <span>Transaction Details</span>
                  {showTxDetails ? <FiChevronUp size={16} /> : <FiChevronDown size={16} />}
                </button>

                {showTxDetails && (
                  <motion.div
                    className="deposit-tx-body"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <div className="deposit-tx-row">
                      <span className="tx-row-label">Amount</span>
                      <span className="tx-row-val">{formatInr(lastTransaction?.amount || parsedAmount)}</span>
                    </div>
                    <div className="deposit-tx-row">
                      <span className="tx-row-label">Payment Method</span>
                      <span className="tx-row-val">{lastTransaction?.method || 'Instant UPI'}</span>
                    </div>
                    <div className="deposit-tx-row">
                      <span className="tx-row-label">Transaction ID</span>
                      <span className="tx-row-val tx-row-mono">{lastTransaction?.orderId || 'TXN_CONFIRMED'}</span>
                    </div>
                    <div className="deposit-tx-row">
                      <span className="tx-row-label">Date & Time</span>
                      <span className="tx-row-val">{lastTransaction?.date || new Date().toLocaleTimeString()}</span>
                    </div>
                    <div className="deposit-tx-row">
                      <span className="tx-row-label">Payment Status</span>
                      <span className="tx-row-status-pill">Completed ✓</span>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Actions */}
              <div className="deposit-success-actions">
                <button
                  type="button"
                  className="deposit-primary-cta"
                  onClick={handleContinueAfterSuccess}
                >
                  Continue
                </button>
                <button
                  type="button"
                  className="deposit-secondary-cta"
                  onClick={handleViewHistory}
                >
                  View Transaction History
                </button>
              </div>
            </motion.div>
          ) : isProcessing ? (
            /* 2. PROCESSING VERIFICATION VIEW */
            <motion.div
              key="processing"
              className="deposit-processing-card"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="deposit-loader-spinner" />
              <h2 className="deposit-proc-title">Verifying Payment</h2>
              <p className="deposit-proc-subtitle">
                Please wait while we confirm your transaction and credit your wallet.
              </p>
              <div className="deposit-proc-badge">
                <FiShield size={14} />
                <span>Securing Ledger Entry</span>
              </div>
            </motion.div>
          ) : (
            /* 3. MAIN FORM VIEW */
            <motion.form
              key="form"
              className="deposit-form-flow"
              onSubmit={handleDepositSubmit}
              noValidate
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {/* Notifications / Errors */}
              {bannerText && (
                <div className="deposit-alert-banner" role="alert">
                  <FiAlertCircle size={16} className="deposit-alert-icon" />
                  <span className="deposit-alert-text">{bannerText}</span>
                </div>
              )}

              {!paymentsAvailable && (
                <div className="deposit-alert-banner deposit-alert-banner--danger" role="alert">
                  <FiAlertCircle size={16} className="deposit-alert-icon" />
                  <span className="deposit-alert-text">
                    Deposit services are temporarily undergoing scheduled maintenance.
                  </span>
                </div>
              )}

              {/* Amount Input Card */}
              <section className="deposit-section-card">
                <label htmlFor="deposit-amount-input" className="deposit-section-label">
                  ENTER AMOUNT (₹)
                </label>

                <div className={`deposit-amount-field ${!isAmountValid && parsedAmount > 0 ? 'deposit-amount-field--error' : ''}`}>
                  <span className="deposit-currency-symbol">₹</span>
                  <input
                    ref={inputRef}
                    id="deposit-amount-input"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="deposit-amount-input"
                    placeholder="0"
                    value={amountStr}
                    onChange={handleAmountChange}
                    autoComplete="off"
                  />
                  {amountStr && (
                    <button
                      type="button"
                      className="deposit-amount-clear-btn"
                      onClick={() => { setAmountStr(''); inputRef.current?.focus(); }}
                      aria-label="Clear amount"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="deposit-limits-helper">
                  <span>Min {formatInr(MIN_DEPOSIT_INR)}</span>
                  <span>•</span>
                  <span>Max {formatInr(MAX_DEPOSIT_INR)}</span>
                </div>

                {/* Quick Amount Chips */}
                <div className="deposit-quick-chips-grid">
                  {QUICK_AMOUNTS.map((amt) => {
                    const isSelected = parsedAmount === amt;
                    return (
                      <button
                        key={amt}
                        type="button"
                        className={`deposit-quick-chip ${isSelected ? 'deposit-quick-chip--active' : ''}`}
                        onClick={() => handleQuickAmount(amt)}
                      >
                        <span>₹{amt >= 1000 ? `${amt / 1000}K` : amt}</span>
                        {isSelected && <FiCheck size={12} className="chip-check-icon" />}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Optional Gateway Toggle for Admin multi-provider testing */}
              {allowUserSelection && availableProviders.length > 1 && (
                <section className="deposit-section-card">
                  <span className="deposit-section-label">SELECT PAYMENT GATEWAY</span>
                  <div className="deposit-provider-tabs">
                    {availableProviders.map((p) => {
                      const pUpper = String(p.provider || p.name || '').toUpperCase();
                      const isActive = selectedProvider === pUpper;
                      return (
                        <button
                          key={pUpper}
                          type="button"
                          className={`deposit-provider-tab ${isActive ? 'deposit-provider-tab--active' : ''}`}
                          onClick={() => setSelectedProvider(pUpper)}
                        >
                          <span>{pUpper === 'CASHFREE' ? '⚡ Cashfree' : '🛡️ Razorpay'}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* Payment Methods */}
              <section className="deposit-section-card">
                <span className="deposit-section-label">PAYMENT METHOD</span>
                <div className="deposit-methods-list">
                  {PAYMENT_METHODS.map((method) => {
                    const isSelected = selectedMethod === method.id;
                    return (
                      <button
                        key={method.id}
                        type="button"
                        className={`deposit-method-item ${isSelected ? 'deposit-method-item--selected' : ''}`}
                        onClick={() => setSelectedMethod(method.id)}
                      >
                        <div className="deposit-method-icon-wrap">{method.icon}</div>
                        <div className="deposit-method-info">
                          <div className="deposit-method-title-row">
                            <span className="deposit-method-name">{method.name}</span>
                            {method.badge && <span className="deposit-method-badge">{method.badge}</span>}
                          </div>
                          <span className="deposit-method-sub">{method.subtitle}</span>
                        </div>
                        <div className={`deposit-radio-circle ${isSelected ? 'deposit-radio-circle--checked' : ''}`}>
                          {isSelected && <div className="deposit-radio-dot" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Security & Regulatory Footnote */}
              <div className="deposit-trust-footnote">
                <div className="trust-item">
                  <FiShield size={14} className="trust-icon" />
                  <span>RBI Regulated Gateways</span>
                </div>
                <div className="trust-item">
                  <FiZap size={14} className="trust-icon" />
                  <span>Instant Credit</span>
                </div>
                <div className="trust-item">
                  <FiLock size={14} className="trust-icon" />
                  <span>Zero Processing Fee</span>
                </div>
              </div>

              {/* Sticky Bottom Action */}
              <div className="deposit-sticky-bar">
                <button
                  type="submit"
                  className="deposit-submit-button"
                  disabled={!isAmountValid || !paymentsAvailable || isLoading || isProcessing}
                >
                  {isLoading || isProcessing ? (
                    <span className="submit-loading-content">
                      <div className="deposit-mini-spinner" />
                      <span>Processing...</span>
                    </span>
                  ) : (
                    <span>Continue to Pay {isAmountValid ? formatInr(parsedAmount) : ''}</span>
                  )}
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
