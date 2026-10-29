function firstFinite(...vals) {
  for (const v of vals) {
    if (v == null || v === '') continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function parseHdfcOrderStatus(json = {}, expectedOrderId = null) {
  const raw = json && typeof json === 'object' ? json : {};
  const status = String(raw.status || raw.order_status || '').toUpperCase();
  const txnStatus = String(raw.txn_detail?.status || '').toUpperCase();
  const pgResp = String(raw.payment_gateway_response?.resp_code || raw.resp_code || '').toUpperCase();
  const orderId = String(raw.order_id || raw.txn_detail?.order_id || '').trim();
  const expected = expectedOrderId != null ? String(expectedOrderId).trim() : '';
  const orderMatches = !expected || !orderId || expected === orderId;
  const chargedFlag = status === 'CHARGED' || txnStatus === 'CHARGED';
  const amountInr = firstFinite(raw.amount, raw.txn_detail?.txn_amount, raw.txn_detail?.net_amount);
  const terminalFail = /FAIL|DECLIN|CANCEL|EXPIRED|AUTHENTICATION_FAILED|AUTHORIZATION_FAILED|JUSPAY_DECLINED/.test(
    status || txnStatus,
  );
  return {
    status: status || txnStatus || 'UNKNOWN',
    charged: Boolean(chargedFlag && orderMatches),
    terminalFail,
    amountInr,
    txnId: raw.txn_id || raw.payment_gateway_response?.txn_id || raw.txn_uuid || raw.id || null,
    orderId: orderId || expected || null,
    customerId: raw.customer_id || null,
    udf2: raw.udf2 == null ? '' : String(raw.udf2),
    respCode: pgResp || null,
    raw,
  };
}

export async function inquireHdfcOrderTwice(fetchJson, expectedOrderId) {
  let lastErr;
  let parsed = null;
  for (let i = 0; i < 2; i += 1) {
    try {
      parsed = parseHdfcOrderStatus(await fetchJson(), expectedOrderId);
      if (parsed.charged) return parsed;
    } catch (err) {
      lastErr = err;
    }
    if (i === 0) await new Promise((r) => setTimeout(r, 400));
  }
  if (parsed) return parsed;
  throw lastErr || new Error('HDFC order status unavailable');
}
