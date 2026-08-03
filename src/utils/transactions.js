const TX_KEY = 'betking_transactions';

export function loadTransactions(email) {
  if (!email) return [];
  try {
    const all = JSON.parse(localStorage.getItem(TX_KEY) || '{}');
    return all[email] || [];
  } catch {
    return [];
  }
}

export function appendTransaction(email, entry) {
  if (!email) return [];
  const all = JSON.parse(localStorage.getItem(TX_KEY) || '{}');
  const list = all[email] || [];
  const next = [
    {
      id: `TX-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      createdAt: new Date().toISOString(),
      ...entry,
    },
    ...list,
  ].slice(0, 100);
  all[email] = next;
  localStorage.setItem(TX_KEY, JSON.stringify(all));
  return next;
}
