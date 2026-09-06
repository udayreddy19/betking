-- Persist sport + winner for multi-sport settlement (OddsEngine V4.4).
ALTER TABLE matches ADD COLUMN IF NOT EXISTS sport VARCHAR(32);
ALTER TABLE matches ADD COLUMN IF NOT EXISTS winner_side VARCHAR(8);

CREATE INDEX IF NOT EXISTS idx_matches_sport_status
  ON matches (sport, status);
