function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function formatInr(amount, currency = 'INR') {
  const n = Number(amount || 0);
  const formatted = n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === 'INR' ? `₹${formatted}` : `${currency} ${formatted}`;
}

export function renderHdfcResponsePage({
  ok,
  gatewayOrderId,
  amountInr,
  currency = 'INR',
  brandName = 'OddsYra',
  viewOrderHref = '/wallet/deposit',
} = {}) {
  const success = Boolean(ok);
  const title = success ? 'Payment successful' : 'Payment not completed';
  const orderNo = gatewayOrderId || '—';
  const amount = amountInr != null ? formatInr(amountInr, currency) : '—';
  const message = success
    ? 'Thank you. Your payment has been received.'
    : 'This payment was not charged. You can return and try again.';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)} · ${esc(brandName)}</title>
  <style>
    body { margin:0; font-family: ui-sans-serif, system-ui, sans-serif; background:#0b1220; color:#e8eef8; }
    main { max-width: 420px; margin: 12vh auto; padding: 0 1rem; }
    .card { background:#121a2b; border-radius:16px; padding:1.5rem 1.4rem; box-shadow: 0 10px 40px rgba(0,0,0,.35); }
    h1 { margin:0 0 .35rem; font-size:1.35rem; }
    .ok { color:#34d399; }
    .bad { color:#f87171; }
    dl { margin:1.1rem 0 0; display:grid; grid-template-columns: 8rem 1fr; gap:.55rem 0.75rem; font-size:.95rem; }
    dt { color:#93a4bb; } dd { margin:0; font-weight:700; }
    a { display:inline-block; margin-top:1.25rem; color:#34d399; font-weight:700; text-decoration:none; }
  </style>
</head>
<body>
  <main>
    <div class="card">
      <h1 class="${success ? 'ok' : 'bad'}">${esc(title)}</h1>
      <p>${esc(message)}</p>
      <dl>
        <dt>Order number</dt><dd>${esc(orderNo)}</dd>
        <dt>Amount</dt><dd>${esc(amount)}</dd>
        <dt>Status</dt><dd>${esc(success ? 'SUCCESS' : 'FAILED')}</dd>
      </dl>
      <a href="${esc(viewOrderHref)}">Continue</a>
    </div>
  </main>
</body>
</html>`;
}
