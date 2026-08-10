-- Migration 001: Initial Schema for BetKing PostgreSQL Database
-- Authoritative Schema for Users, Sports, Bets, Wallets, Ledger, KYC, Support Chat, Audit

-- 1. IDENTITY & USERS
CREATE TABLE IF NOT EXISTS users (
  user_id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(32),
  password_hash VARCHAR(255),
  tenant_id VARCHAR(64) DEFAULT 'betking_in',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id VARCHAR(64) PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  display_name VARCHAR(128),
  kyc_status VARCHAR(32) DEFAULT 'NOT_STARTED', -- NOT_STARTED | PENDING | UNDER_REVIEW | VERIFICATION_REQUIRED | VERIFIED | REJECTED
  kyc_details TEXT,
  risk_tier VARCHAR(32) DEFAULT 'LOW_RISK',
  lifetime_value NUMERIC(14,2) DEFAULT 0.00,
  betting_style VARCHAR(32) DEFAULT 'CASUAL',
  account_status VARCHAR(32) DEFAULT 'ACTIVE',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. SPORTS, MATCHES & PLAYERS
CREATE TABLE IF NOT EXISTS sports (
  sport_id VARCHAR(32) PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  slug VARCHAR(64) UNIQUE NOT NULL,
  display_order INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS competitions (
  competition_id VARCHAR(64) PRIMARY KEY,
  sport_id VARCHAR(32) REFERENCES sports(sport_id),
  name VARCHAR(128) NOT NULL,
  country VARCHAR(64) DEFAULT 'India'
);

CREATE TABLE IF NOT EXISTS teams (
  team_id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  short_name VARCHAR(16),
  sport_id VARCHAR(32) REFERENCES sports(sport_id)
);

CREATE TABLE IF NOT EXISTS players (
  player_id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  team_id VARCHAR(64) REFERENCES teams(team_id),
  role VARCHAR(64) DEFAULT 'Player'
);

CREATE TABLE IF NOT EXISTS matches (
  match_id VARCHAR(64) PRIMARY KEY,
  competition_id VARCHAR(64) REFERENCES competitions(competition_id),
  team1_id VARCHAR(64) REFERENCES teams(team_id),
  team2_id VARCHAR(64) REFERENCES teams(team_id),
  start_time TIMESTAMP WITH TIME ZONE,
  status VARCHAR(32) DEFAULT 'LIVE', -- UPCOMING | LIVE | FINISHED | CANCELLED
  live_score1 VARCHAR(64) DEFAULT '0/0',
  live_score2 VARCHAR(64) DEFAULT '0/0',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- MATCH_PLAYERS JUNCTION TABLE (Enforces player isolation per match)
CREATE TABLE IF NOT EXISTS match_players (
  id SERIAL PRIMARY KEY,
  match_id VARCHAR(64) NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
  team_id VARCHAR(64) NOT NULL REFERENCES teams(team_id),
  player_id VARCHAR(64) NOT NULL REFERENCES players(player_id),
  provider_player_id VARCHAR(64),
  status VARCHAR(32) DEFAULT 'ACTIVE',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_match_team_player UNIQUE (match_id, team_id, player_id)
);

CREATE TABLE IF NOT EXISTS markets (
  market_id VARCHAR(64) PRIMARY KEY,
  match_id VARCHAR(64) REFERENCES matches(match_id) ON DELETE CASCADE,
  name VARCHAR(128) NOT NULL,
  category VARCHAR(64) DEFAULT 'MAIN',
  status VARCHAR(32) DEFAULT 'OPEN'
);

CREATE TABLE IF NOT EXISTS selections (
  selection_id VARCHAR(64) PRIMARY KEY,
  market_id VARCHAR(64) REFERENCES markets(market_id) ON DELETE CASCADE,
  name VARCHAR(128) NOT NULL,
  odds NUMERIC(8,2) NOT NULL DEFAULT 1.90,
  status VARCHAR(32) DEFAULT 'OPEN'
);

-- 3. BETTING & HISTORICAL BET SNAPSHOTS
CREATE TABLE IF NOT EXISTS bets (
  bet_id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) REFERENCES users(user_id),
  match_id VARCHAR(64) REFERENCES matches(match_id),
  selection_id VARCHAR(64) REFERENCES selections(selection_id),
  stake NUMERIC(14,2) NOT NULL CHECK (stake > 0),
  odds NUMERIC(8,2) NOT NULL,
  potential_payout NUMERIC(14,2) NOT NULL,
  status VARCHAR(32) DEFAULT 'PENDING', -- PENDING | WON | LOST | CANCELLED | CASHED_OUT
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. WALLET & DOUBLE-ENTRY LEDGER
CREATE TABLE IF NOT EXISTS wallets (
  wallet_id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) UNIQUE NOT NULL REFERENCES users(user_id),
  balance NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (balance >= 0),
  bonus_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00 CHECK (bonus_balance >= 0),
  currency VARCHAR(8) DEFAULT 'INR',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
  transaction_id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) REFERENCES users(user_id),
  type VARCHAR(32) NOT NULL, -- DEPOSIT | WITHDRAWAL | BET_STAKE | BET_PAYOUT | REFUND
  method VARCHAR(64) DEFAULT 'UPI',
  utr VARCHAR(128),
  amount NUMERIC(14,2) NOT NULL,
  status VARCHAR(32) DEFAULT 'COMPLETED', -- PENDING | COMPLETED | FAILED | CANCELLED
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  entry_id SERIAL PRIMARY KEY,
  wallet_id VARCHAR(64) REFERENCES wallets(wallet_id),
  transaction_id VARCHAR(64) REFERENCES transactions(transaction_id),
  type VARCHAR(32) NOT NULL, -- CREDIT | DEBIT
  amount NUMERIC(14,2) NOT NULL,
  balance_after NUMERIC(14,2) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. COMPLIANCE & KYC CASES
CREATE TABLE IF NOT EXISTS kyc_cases (
  case_id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) REFERENCES users(user_id),
  status VARCHAR(32) DEFAULT 'UNDER_REVIEW',
  pan_number VARCHAR(16),
  aadhaar_number VARCHAR(16),
  document_urls TEXT[],
  reviewed_by VARCHAR(64),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. SUPPORT CHAT PERSISTENCE
CREATE TABLE IF NOT EXISTS support_conversations (
  conversation_id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) REFERENCES users(user_id),
  tenant_id VARCHAR(64) DEFAULT 'betking_in',
  assigned_agent VARCHAR(128) DEFAULT 'Priya Sharma',
  assigned_team VARCHAR(64) DEFAULT 'GENERAL',
  category VARCHAR(64) DEFAULT 'GENERAL',
  priority VARCHAR(32) DEFAULT 'NORMAL',
  status VARCHAR(32) DEFAULT 'OPEN', -- NEW | OPEN | ASSIGNED | WAITING_FOR_USER | WAITING_FOR_SUPPORT | RESOLVED | CLOSED
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS support_messages (
  message_id VARCHAR(64) PRIMARY KEY,
  conversation_id VARCHAR(64) REFERENCES support_conversations(conversation_id) ON DELETE CASCADE,
  sender VARCHAR(32) NOT NULL, -- customer | agent | system
  agent_name VARCHAR(128),
  text TEXT NOT NULL,
  attachments JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS support_internal_notes (
  note_id VARCHAR(64) PRIMARY KEY,
  conversation_id VARCHAR(64) REFERENCES support_conversations(conversation_id) ON DELETE CASCADE,
  agent_id VARCHAR(64) NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS support_feedback (
  feedback_id VARCHAR(64) PRIMARY KEY,
  conversation_id VARCHAR(64) UNIQUE REFERENCES support_conversations(conversation_id) ON DELETE CASCADE,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_events (
  event_id SERIAL PRIMARY KEY,
  actor_id VARCHAR(64) NOT NULL,
  target_id VARCHAR(64),
  action VARCHAR(128) NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
