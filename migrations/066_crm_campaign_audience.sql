-- 066: CRM campaign audience (segment + VIP) + growth analytics helpers
-- Extends targeted deposit freebet promotions for segment/VIP audience filters.
-- Does not change the grant gate: only status = ACTIVE receives free-bet grants.

ALTER TABLE promotions
  ADD COLUMN IF NOT EXISTS audience_segment_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS audience_vip_tiers JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_promotions_audience_segment
  ON promotions (audience_segment_id)
  WHERE audience_segment_id IS NOT NULL;

COMMENT ON COLUMN promotions.audience_segment_id IS
  'Optional customer_segments.id used when assigning targeted campaign audience';
COMMENT ON COLUMN promotions.audience_vip_tiers IS
  'Optional VIP tier allowlist JSON array, e.g. ["GOLD","PLATINUM","DIAMOND"]';
