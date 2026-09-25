# Pass 8 — DEPENDENCY_AUDIT

```
npm audit → 3 moderate
@vitest/mocker / vitest / @vitest/coverage-v8
GHSA-82fw-gwwq-j7x9 (dev tooling path traversal)
```

**Reassessment:** development-only (test runner). Not in production runtime bundle.
**Action:** retain Pass 5/6/7 exception; do not blindly upgrade without regression.
**Production runtime vulns found:** none in this audit.
