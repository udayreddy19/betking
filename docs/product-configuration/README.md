# Product Configuration (Wallet / Betting)

Admin-controlled product toggles that turn the same OddsYra application into:

- **Wallet-only**
- **Betting-only** (existing OddsYra sportsbook)
- **Wallet + Betting**
- **Neither** (controlled “Currently Unavailable” page; Admin remains accessible)

## Authoritative store

PostgreSQL tables (additive migration `133_product_configuration.sql`):

- `product_configuration` — singleton row (`id = 1`)
- `product_configuration_history` — change audit trail

Defaults for development: **Wallet ON**, **Betting ON**.

Disabling a product means **ACCESS OFF**. It does **not** delete bets, wallets, transactions, or users. Background settlement and payment webhooks continue for in-flight operations.

## APIs

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/config/products` | Public | Frontend ProductContext |
| `GET` | `/api/admin/products` | Admin | Current toggles |
| `PUT` | `/api/admin/products` | Super/Ops Admin | Update toggles |
| `GET` | `/api/admin/products/history` | Super/Ops Admin | Change history |

Example public response:

```json
{
  "wallet": true,
  "betting": false,
  "walletEnabled": true,
  "bettingEnabled": false
}
```

## Backend enforcement

- Middleware: `server/middleware/requireProduct.js` → `requireProduct('wallet'|'betting')`
- Engine asserts: `assertProductEnabled` in deposit, withdrawal, bet placement, cashout
- Wallet user APIs gated; **webhooks remain open** so pending deposits can settle
- Betting user APIs gated; **admin + settlement workers** are not blocked by the product guard
- Admin `/api/admin/*` is never product-gated

Disabled response:

```json
{
  "success": false,
  "code": "PRODUCT_DISABLED",
  "product": "betting",
  "message": "This product is currently unavailable."
}
```

## Frontend

- `ProductContext` (`src/context/ProductContext.jsx`) — `walletEnabled`, `bettingEnabled`, helpers
- Dynamic Header / Sidebar / Home / route guards (`ProductRoute`, `PlatformGate`)
- WebSocket channel `config:products` for near-real-time refresh (poll fallback every 15s)

## Admin UI

**Settings → Product configuration**

Confirmations when disabling a product or turning both off.

## Wallet ↔ Betting money model

- **Wallet ledger** (PostgreSQL) remains the financial source of truth for deposits/withdrawals.
- **Betting stakes / bonuses / free bets** keep existing OddsYra semantics (wallet buckets + promotional ledgers).
- Product toggles do not merge or invent a second balance. When both are ON, the UI separates Wallet actions from Betting navigation.

## Operations notes

| Event | Behavior |
|-------|----------|
| Betting disabled with open bets | UI/API access off; settlement jobs continue |
| Wallet disabled with pending deposit | New deposits blocked; webhooks can still credit |
| Wallet disabled with pending withdrawal | New withdrawals blocked; ops/admin payout paths unchanged |
| Both disabled | Users see unavailable page; Admin can re-enable |

## Compliance

This is a software control plane. KYC/AML approval, payment provider onboarding, and gambling licensing remain external operational requirements.
