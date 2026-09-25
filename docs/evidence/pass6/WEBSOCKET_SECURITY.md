# Pass 6 — WEBSOCKET_SECURITY

| Test | Result |
| --- | --- |
| `user:{ownId}` subscribe allow | PASS |
| `user:{otherId}` cross-user deny | PASS |
| Anonymous subscribe to user channel deny | PASS |
| Settlement WS UI E2E (wallet Available refresh) | PASS (Playwright) |

**WebSocket gate:** PASS  
Channel authorization not weakened.
