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

export function loadAllSystemTransactions() {
  try {
    const all = JSON.parse(localStorage.getItem(TX_KEY) || '{}');
    let list = [...INITIAL_MOCK_TRANSACTIONS];

    Object.keys(all).forEach((email) => {
      const userTxs = all[email] || [];
      userTxs.forEach((tx) => {
        if (!list.some((existing) => existing.id === tx.id)) {
          list.push({ ...tx, userEmail: email });
        }
      });
    });

    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch {
    return INITIAL_MOCK_TRANSACTIONS;
  }
}
