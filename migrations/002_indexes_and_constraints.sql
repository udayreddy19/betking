-- Migration 002: Performance Indexes & Relational Constraints for BetKing PostgreSQL

-- Users & Profiles Indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_kyc ON user_profiles(kyc_status);

-- Matches & Players Indexes
CREATE INDEX IF NOT EXISTS idx_matches_competition ON matches(competition_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_match_players_match ON match_players(match_id);
CREATE INDEX IF NOT EXISTS idx_match_players_player ON match_players(player_id);

-- Betting Indexes
CREATE INDEX IF NOT EXISTS idx_bets_user ON bets(user_id);
CREATE INDEX IF NOT EXISTS idx_bets_match ON bets(match_id);
CREATE INDEX IF NOT EXISTS idx_bets_status ON bets(status);
CREATE INDEX IF NOT EXISTS idx_bets_created ON bets(created_at DESC);

-- Finance & Ledger Indexes
CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_utr ON transactions(utr);
CREATE INDEX IF NOT EXISTS idx_ledger_wallet ON ledger_entries(wallet_id);

-- Support Chat Indexes
CREATE INDEX IF NOT EXISTS idx_support_conv_user ON support_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_support_conv_status ON support_conversations(status);
CREATE INDEX IF NOT EXISTS idx_support_msg_conv ON support_messages(conversation_id);

-- Audit Indexes
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_events(action);
