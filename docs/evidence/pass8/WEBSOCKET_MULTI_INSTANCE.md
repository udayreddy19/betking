# Pass 8 — WEBSOCKET_MULTI_INSTANCE

| Check | Result |
| --- | --- |
| channel_auth_own | PASS |
| channel_auth_cross_deny | PASS |
| redis_fanout_configured | PASS (`publishWsFanout` Redis pub/sub) |
| cross_instance_event_delivery_soak | NOT_RUN |

**Gate:** WARN — fanout code path present; full multi-instance WS soak not executed in Pass 8.

User A cannot subscribe to User B private wallet/bet channels (auth matrix PASS).
