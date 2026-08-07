const TX_KEY = 'betking_transactions';

const INITIAL_MOCK_TRANSACTIONS = [
  { id: 'TXN-98421', userEmail: 'demo@betking.com', userName: 'Demo User', type: 'DEPOSIT', amount: 5000, method: 'UPI', utr: 'UTR984210452', status: 'COMPLETED', createdAt: new Date(Date.now() - 3600000).toISOString() },
  { id: 'TXN-98420', userEmail: 'vikram.s@gmail.com', userName: 'Vikram S.', type: 'WITHDRAWAL', amount: 2500, method: 'Paytm', utr: 'UTR984201948', status: 'PENDING', createdAt: new Date(Date.now() - 7200000).toISOString() },
  { id: 'TXN-98419', userEmail: 'ananya.p@yahoo.com', userName: 'Ananya P.', type: 'DEPOSIT', amount: 10000, method: 'GPay', utr: 'UTR984198273', status: 'COMPLETED', createdAt: new Date(Date.now() - 10800000).toISOString() },
  { id: 'TXN-98418', userEmail: 'rohan.v@outlook.com', userName: 'Rohan Verma', type: 'BET_WIN', amount: 34000, method: 'Sportsbook', utr: 'BET-88210', status: 'COMPLETED', createdAt: new Date(Date.now() - 14400000).toISOString() },
  { id: 'TXN-98417', userEmail: 'manish.k@gmail.com', userName: 'Manish Kumar', type: 'DEPOSIT', amount: 2500, method: 'PhonePe', utr: 'UTR984175512', status: 'COMPLETED', createdAt: new Date(Date.now() - 18000000).toISOString() },
  { id: 'TXN-98416', userEmail: 'arjun.r@yahoo.com', userName: 'Arjun Reddy', type: 'WITHDRAWAL', amount: 5000, method: 'UPI', utr: 'UTR984160019', status: 'COMPLETED', createdAt: new Date(Date.now() - 21600000).toISOString() },
  { id: 'TXN-98415', userEmail: 'karan.j@gmail.com', userName: 'Karan Joshi', type: 'BONUS_CLAIM', amount: 1000, method: 'Daily Spin', utr: 'SPIN-1000', status: 'COMPLETED', createdAt: new Date(Date.now() - 25200000).toISOString() },
  { id: 'TXN-98414', userEmail: 'siddharth.r@gmail.com', userName: 'Siddharth R.', type: 'DEPOSIT', amount: 15000, method: 'NetBanking', utr: 'UTR984149921', status: 'COMPLETED', createdAt: new Date(Date.now() - 28800000).toISOString() },
];

export function loadTransactions(email) {
  if (!email) return [];
  try {
    const all = JSON.parse(localStorage.getItem(TX_KEY) || '{}');
    if (!all[email] || all[email].length === 0) {
      if (email === 'demo@betking.com') {
        all[email] = INITIAL_MOCK_TRANSACTIONS.filter((t) => t.userEmail === email);
        localStorage.setItem(TX_KEY, JSON.stringify(all));
        return all[email];
      }
      return [];
    }
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
      id: `TXN-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      createdAt: new Date().toISOString(),
      ...entry,
    },
    ...list,
  ].slice(0, 100);
  all[email] = next;
  localStorage.setItem(TX_KEY, JSON.stringify(all));
  return next;
}

const OVERRIDES_KEY = 'betking_tx_overrides';

export function updateTransactionStatus(txId, newStatus, utrCode = null) {
  try {
    const all = JSON.parse(localStorage.getItem(TX_KEY) || '{}');
    let updatedTx = null;

    Object.keys(all).forEach((email) => {
      const userTxs = all[email] || [];
      const idx = userTxs.findIndex((t) => t.id === txId);
      if (idx >= 0) {
        userTxs[idx].status = newStatus;
        if (utrCode) userTxs[idx].utr = utrCode;
        userTxs[idx].processedAt = new Date().toISOString();
        updatedTx = userTxs[idx];
      }
    });
    localStorage.setItem(TX_KEY, JSON.stringify(all));

    const overrides = JSON.parse(localStorage.getItem(OVERRIDES_KEY) || '{}');
    overrides[txId] = { status: newStatus, utr: utrCode, processedAt: new Date().toISOString() };
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));

    const mockIdx = INITIAL_MOCK_TRANSACTIONS.findIndex((t) => t.id === txId);
    if (mockIdx >= 0) {
      INITIAL_MOCK_TRANSACTIONS[mockIdx].status = newStatus;
      if (utrCode) INITIAL_MOCK_TRANSACTIONS[mockIdx].utr = utrCode;
    }

    return updatedTx || { id: txId, status: newStatus };
  } catch (err) {
    console.error('Error updating transaction status:', err);
    return null;
  }
}

export function loadAllSystemTransactions() {
  try {
    const all = JSON.parse(localStorage.getItem(TX_KEY) || '{}');
    const overrides = JSON.parse(localStorage.getItem(OVERRIDES_KEY) || '{}');

    let list = INITIAL_MOCK_TRANSACTIONS.map((tx) => {
      if (overrides[tx.id]) {
        return { ...tx, ...overrides[tx.id] };
      }
      return tx;
    });

    Object.keys(all).forEach((email) => {
      const userTxs = all[email] || [];
      userTxs.forEach((tx) => {
        const override = overrides[tx.id] || {};
        const mergedTx = { ...tx, userEmail: email, ...override };
        const idx = list.findIndex((existing) => existing.id === tx.id);
        if (idx >= 0) {
          list[idx] = mergedTx;
        } else {
          list.push(mergedTx);
        }
      });
    });

    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch {
    return INITIAL_MOCK_TRANSACTIONS;
  }
}

