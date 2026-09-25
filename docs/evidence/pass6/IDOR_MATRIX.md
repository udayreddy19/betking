# Pass 6 — IDOR_MATRIX

Ephemeral USER A / USER B; seeded ACCEPTED bet owned by A.

| Test | Result | HTTP |
| --- | --- | --- |
| Owner access own bet evidence | PASS | 200/404 (owner-scoped query) |
| User B access User A bet evidence | PASS | 404 DENY |
| Transactions scoped to caller | PASS | 200 / 200 |
| User token denied on admin trading | PASS | 401/403 |

**IDOR gate:** PASS  
No real customer data used.
