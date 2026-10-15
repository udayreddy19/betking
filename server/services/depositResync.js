import { verifyPayuPayment, isPayuStatusPaid } from './payu.js';
import { getRazorpay, isRazorpayConfigured } from './razorpay.js';

function pineAmountPaise(order) {
  const v = order?.order_amount?.value
    ?? order?.amount?.value
    ?? order?.amount;
  if (v == null) return null;
  return Math.round(Number(v));
}

function payuAmountPaise(tx) {
  const amt = tx?.amount ?? tx?.net_amount_debit;
  if (amt == null || amt === '') return null;
  return Math.round(Number(amt) * 100);
}

/**
 * Re-check provider and settle if paid. Shared by admin resync + deposit worker.
 */
export async function resyncDeposit(dep) {
  if (!dep) throw Object.assign(new Error('Not found'), { status: 404 });
  if (dep.status === 'paid') {
    return { ok: true, status: 'paid', message: 'Already paid', skipped: true };
  }

  const { settleDepositByOrder } = await import('../routes/deposits.js');
  const provider = String(dep.provider || '').toUpperCase();

  if (provider === 'PAYU' && dep.provider_order_id) {
    const verified = await verifyPayuPayment(dep.provider_order_id);
    const tx = verified.transaction || verified;
    const txStatus = tx?.status || verified.status;
    if (!isPayuStatusPaid(txStatus)) {
      return {
        ok: true,
        status: String(txStatus || dep.status).toLowerCase(),
        paid: false,
        message: `Provider status: ${txStatus || 'unknown'}`,
      };
    }
    const settled = await settleDepositByOrder({
      orderId: dep.provider_order_id,
      paymentId: tx?.mihpayid || null,
      depositId: dep.id,
      paidAmountPaise: payuAmountPaise(tx),
    });
    return { ok: true, paid: true, ...settled };
  }

  if (provider === 'PINELABS' && dep.provider_order_id) {
    const { fetchOrder, isPinelabsOrderPaid } = await import('./pinelabs.js');
    const order = await fetchOrder(dep.provider_order_id);
    if (!isPinelabsOrderPaid(order)) {
      return {
        ok: true,
        status: String(order?.status || dep.status).toLowerCase(),
        paid: false,
        message: `Provider status: ${order?.status || 'unknown'}`,
      };
    }
    const settled = await settleDepositByOrder({
      orderId: dep.provider_order_id,
      paymentId: order?.payments?.[0]?.id || null,
      depositId: dep.id,
      paidAmountPaise: pineAmountPaise(order),
    });
    return { ok: true, paid: true, ...settled };
  }

  if (provider === 'RAZORPAY' && dep.provider_order_id && isRazorpayConfigured()) {
    const rz = getRazorpay();
    const payments = await rz.orders.fetchPayments(dep.provider_order_id);
    const items = payments?.items || [];
    const captured = items.find((p) => String(p.status) === 'captured');
    if (!captured) {
      return {
        ok: true,
        status: dep.status,
        paid: false,
        message: items.length
          ? `Razorpay payments: ${items.map((p) => p.status).join(', ')}`
          : 'No Razorpay payments on this order yet',
      };
    }
    const settled = await settleDepositByOrder({
      orderId: dep.provider_order_id,
      paymentId: captured.id,
      depositId: dep.id,
      paidAmountPaise: Number(captured.amount),
    });
    return { ok: true, paid: true, ...settled };
  }

  if (provider === 'CASHFREE') {
    return {
      ok: false,
      status: dep.status,
      paid: false,
      message: 'Cashfree was removed. Expire or mark-failed if abandoned.',
    };
  }

  return {
    ok: true,
    status: dep.status,
    paid: false,
    message: 'Resync not available for this provider/order.',
  };
}
