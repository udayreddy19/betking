-- Split a deposit-match free bet / bonus into N discrete stakes (e.g. ₹10,000 → 10 × ₹1,000).
ALTER TABLE promotions
  ADD COLUMN IF NOT EXISTS split_parts INT NOT NULL DEFAULT 1;

COMMENT ON COLUMN promotions.split_parts IS
  'How many discrete free-bet/bonus instruments to issue for one grant. 1 = single stake.';
