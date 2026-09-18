# OddsYra monitoring

## Scrapes
- `GET /metrics` — Prometheus text (localhost or `Authorization: Bearer $METRICS_TOKEN`)
- `GET /health` — liveness
- Ops alerts: `ops_alert_rules` + `evaluateOpsThresholds` (scheduler)

## Money-path rules (seeded in migration 130)
| rule_key | Meaning |
|----------|---------|
| `DEPOSIT_FAILURE_SPIKE` | Failed deposits in window |
| `SETTLEMENT_FAILURE_SPIKE` | Failed settlement jobs |
| `REFERRAL_PLAY_SPIKE` | Burst of play-commission grants |
| `WALLET_LEDGER_MISMATCH` | Open financial discrepancies |
| `SRL_TOSS_AUTO_LOCK` | Raised when toss auto-locks / blocked |
| `OUTBOX_BACKLOG` | Pending outbox events |
| `TOTALS_LIABILITY_HIGH` | Per-match totals liability |

## Alerting
1. Scrape `/metrics` every 15–30s
2. Admin → Operations → Alert rules (patch thresholds)
3. In-app alerts via `admin_notifications` + optional webhook channel in rule metadata

## Verify after deploy
```bash
curl -sf https://oddsyra.com/health
curl -sf -H "Authorization: Bearer $METRICS_TOKEN" https://oddsyra.com/metrics | head
```
