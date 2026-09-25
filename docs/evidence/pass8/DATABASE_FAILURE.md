# Pass 8 — DATABASE_FAILURE

**Status:** NOT_RUN (controlled DB outage soak not executed)

Policy retained: PostgreSQL is authoritative for wallet/ledger/bets/settlement. Transient DB errors must not return false-success financial mutations. No intentional DB corruption performed.
