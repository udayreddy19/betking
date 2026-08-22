# PRODUCTION E2E CHECKLIST

**Status:** Browser E2E is **NOT PASS** until each step has DOM evidence.

## Automated (API / Vitest) — present

| Step | Coverage | Status |
|------|----------|--------|
| Deposit credit (ledger) | `fullMoneyLifecycle` / deposit engine tests | API PASS |
| Place bet → debit | `fullMoneyLifecycle` | API PASS |
| WIN @ 1.06 → ₹1030 → second bet | `fullMoneyLifecycle` | API PASS |
| LOSS / VOID / locked VOID | Vitest | API PASS |
| Cashout race | `cashoutSettlementRace` / concurrency | API PASS |
| WS outbox payload / isolation | `financialWsOutbox` | Unit PASS |
| Product UI gates | `e2e/product-gates.ui.spec.js` | Partial UI |

## Browser (Playwright / Chrome) — required for GREEN

| # | Step | Evidence required | Status |
|---|------|-------------------|--------|
| 1 | Register | Screenshot + network | **NOT VERIFIED** |
| 2 | Login | Session cookie / JWT | **NOT VERIFIED** |
| 3 | Wallet balance visible | Header DOM | **NOT VERIFIED** |
| 4 | Deposit (sandbox) | Balance updates | **NOT VERIFIED** |
| 5 | Place bet | My Bets OPEN | **NOT VERIFIED** |
| 6 | Settlement | Status WON/LOST without refresh | **NOT VERIFIED** |
| 7 | Wallet via WS | Balance change without F5 | **NOT VERIFIED** |
| 8 | Second bet from winnings | Placement succeeds | **NOT VERIFIED** |
| 9 | Withdrawal request | Reserved UI | **NOT VERIFIED** |
| 10 | Admin approve | Final balance | **NOT VERIFIED** |
| 11 | WS disconnect → settle → reconnect | Resync | **NOT VERIFIED** |

## Commands

```bash
npx playwright test e2e/product-gates.ui.spec.js
npx playwright test e2e/money-flow.api.spec.js
# Add: e2e/money-lifecycle.browser.spec.js when deposit sandbox credentials exist
```

**Do not mark GREEN until browser rows 1–11 are evidenced.**
