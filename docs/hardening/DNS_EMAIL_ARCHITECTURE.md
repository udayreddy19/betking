# OddsYra DNS / Email Architecture (audit 2026-10-13)

**Do not change DNS automatically.** This document records evidence and the recommended plan.

## Observed records (live dig)

### MX
| Priority | Host |
|---------:|------|
| 10 | `mx.zoho.in` |
| 10 | `inbound-smtp.ap-northeast-1.amazonaws.com` |
| 20 | `mx2.zoho.in` |
| 50 | `mx3.zoho.in` |

**Finding:** Zoho primary and AWS SES inbound share priority **10**. That is **not** a clean Zoho failover chain — equal-priority MX can split inbound mail randomly.

**Intended architecture (OddsYra production mailboxes):** Zoho Mail for `no-reply@`, `promos@`, `support@`, `alerts@`, `payments@`, `admin@`.

**AWS SES MX** is likely leftover / accidental unless SES inbound receipt rules are actively used for `@oddsyra.com`.

### SPF
```
v=spf1 include:zoho.in include:_spf.reach.hostinger.com ~all
```
- Zoho senders authorized.
- Hostinger Reach also authorized.
- Soft fail (`~all`).

### DKIM
- `zoho._domainkey.oddsyra.com` — present (RSA public key observed).

### DMARC
```
v=DMARC1; p=none
```
- Monitoring only. Conservative rollout later: `p=none` → `p=quarantine` → `p=reject` with rua reporting.

## Application SMTP (outbound)

| Channel | From | Auth user | Status 2026-10-13 |
|---------|------|-----------|-------------------|
| Transactional | `OddsYra <no-reply@oddsyra.com>` | `no-reply@oddsyra.com` | PASS (verify + live send) |
| Promotions | `promos@oddsyra.com` | `promos@oddsyra.com` | CONFIGURATION_REQUIRED (`SMTP_PROMOS_PASSWORD` empty); `PROMOTIONS_EMAIL_ENABLED=false` |
| Support send-as | `support@oddsyra.com` | support (falls back to primary Zoho pass) | PASS |
| Alerts send-as | `alerts@oddsyra.com` | alerts (falls back to primary Zoho pass) | PASS |
| Payments ops (TO) | n/a | recipient `payments@oddsyra.com` | PASS (ops log SENT) |
| SMTP fallback | Brevo/etc. | unset | NOT_CONFIGURED |

## Exact DNS change plan (manual)

Only if SES inbound is **not** required:

1. Remove MX `10 inbound-smtp.ap-northeast-1.amazonaws.com.`
2. Keep Zoho MX: `10 mx.zoho.in`, `20 mx2.zoho.in`, `50 mx3.zoho.in`.
3. Re-check inbound to `support@oddsyra.com` and `alerts@oddsyra.com`.
4. Keep SPF includes until Hostinger Reach is confirmed unused; then remove `include:_spf.reach.hostinger.com`.
5. Keep DMARC at `p=none` until 2 weeks of clean aggregate reports, then raise policy.

## Application flags (after hardening)

```
PROMOTIONS_EMAIL_ENABLED=false
PROMOTIONS_ALLOW_PRIMARY_FALLBACK=false
PROMOTIONS_SMTP_HOST=smtp.zoho.in
PROMOTIONS_FROM_EMAIL=promos@oddsyra.com
PROMOTIONS_FROM_NAME=OddsYra
```

To enable promotions later: set Zoho app password into `SMTP_PROMOS_PASSWORD` (or `PROMOTIONS_SMTP_PASSWORD`), set `PROMOTIONS_EMAIL_ENABLED=true`, restart backend, run admin email diagnostics test kind=`promotion`.
