-- Migration 102: Drop strict FK constraints on matches table to allow multi-provider event persistence
-- Live feeds and external providers use dynamic string identifiers for competitions and teams.

ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_competition_id_fkey;
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_team1_id_fkey;
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_team2_id_fkey;
