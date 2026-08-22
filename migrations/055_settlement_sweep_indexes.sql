-- Settlement queue + open bet sweep indexes (AUD-013 / Phase 18)
CREATE INDEX IF NOT EXISTS idx_settlement_jobs_status_scheduled
  ON settlement_jobs (status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_bets_status_match_id
  ON bets (status, match_id);

CREATE INDEX IF NOT EXISTS idx_settlement_jobs_bet_id_status
  ON settlement_jobs (bet_id, status);
