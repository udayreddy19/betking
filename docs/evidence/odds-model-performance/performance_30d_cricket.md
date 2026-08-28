# ODDSENGINE V3 MODEL PERFORMANCE REPORT (30D - CRICKET)

**Timestamp**: 2026-08-28T17:46:37.133Z  
**Champion Model**: `v3.1-prod` (Authoritative)  
**Challenger Model**: `v3.2-candidate-004` (Shadow)  
**Settled Production Observations**: 0  
**Real-World Validation Status**: **NOT_VERIFIED** (Insufficient settled data)  

---

## Performance Summary

| Metric | Champion (v3.1-prod) | Challenger (v3.2-candidate-004) | Delta | Status |
|---|---|---|---|---|
| **Brier Score** | 0.185 (Baseline) | 0.167 (Synthetic) | -0.018 | SYNTHETIC_ONLY |
| **Log Loss** | 0.542 (Baseline) | 0.518 (Synthetic) | -0.024 | SYNTHETIC_ONLY |
| **ECE** | 0.038 (Baseline) | 0.030 (Synthetic) | -0.008 | SYNTHETIC_ONLY |

---

## Governance Decision
- **Final Decision**: `INSUFFICIENT_DATA`
- **Recommendation**: `KEEP_SHADOW`
- **Action**: Keep `v3.1-prod` authoritative. Continue shadow observation collection.
