-- Migration 047: Allow dynamic odds-engine selection IDs on bets
-- Live markets use synthetic selection_ids that are not pre-seeded into selections.

ALTER TABLE bets DROP CONSTRAINT IF EXISTS bets_selection_id_fkey;
ALTER TABLE bets DROP CONSTRAINT IF EXISTS bets_match_id_fkey;
ALTER TABLE bets DROP CONSTRAINT IF EXISTS bets_user_id_fkey;

-- Keep user linkage as soft reference (app enforces auth); recreate without FK if needed later.
-- Match/selection FKs intentionally omitted for live V3 odds selections.

ALTER TABLE bet_selections DROP CONSTRAINT IF EXISTS bet_selections_selection_id_fkey;
ALTER TABLE bet_selections DROP CONSTRAINT IF EXISTS bet_selections_match_id_fkey;
