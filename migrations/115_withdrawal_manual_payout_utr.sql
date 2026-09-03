-- Manual payout proof: unique UTR/reference on withdrawals.payout_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_payout_id_unique
  ON withdrawals (payout_id)
  WHERE payout_id IS NOT NULL AND payout_id <> '';
