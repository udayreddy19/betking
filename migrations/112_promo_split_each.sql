-- Operator-controlled pack size: N × ₹each (not a divided lump).
ALTER TABLE promotions
  ADD COLUMN IF NOT EXISTS split_each NUMERIC(14, 2);

COMMENT ON COLUMN promotions.split_each IS
  'Stake size of each pack piece when split_parts > 1. Null means a single stake.';
