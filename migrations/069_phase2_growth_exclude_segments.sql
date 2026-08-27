-- 069: Phase 2 Growth — campaign exclude segments (additive)
-- Reuses promotions + customer_segments; does not create parallel campaign tables.

ALTER TABLE promotions
  ADD COLUMN IF NOT EXISTS audience_exclude_segment_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN promotions.audience_exclude_segment_ids IS
  'JSON array of customer_segments.id values excluded from targeted campaign audience';
