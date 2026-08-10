import { pool } from '../db/pg.js';
import dotenv from 'dotenv';

dotenv.config();

async function seedDevelopmentData() {
  console.log('🌱 SEEDING LOCAL POSTGRESQL DEVELOPMENT DATA...');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Seed Users & Profiles
    await client.query(`
      INSERT INTO users (user_id, email, phone, tenant_id)
      VALUES ('user_demo_101', 'demo@betking.com', '+919876543210', 'betking_in')
      ON CONFLICT (email) DO NOTHING;
    `);

    await client.query(`
      INSERT INTO user_profiles (user_id, display_name, kyc_status, kyc_details, risk_tier, lifetime_value, account_status)
      VALUES ('user_demo_101', 'John Doe', 'VERIFIED', 'Aadhaar & PAN verified on 2026-08-01', 'LOW_RISK', 15000.00, 'ACTIVE')
      ON CONFLICT (user_id) DO UPDATE SET kyc_status = 'VERIFIED';
    `);

    // 2. Seed Wallets & Initial Balance & Initial Ledger Credit
    await client.query(`
      INSERT INTO wallets (wallet_id, user_id, balance, bonus_balance, currency)
      VALUES ('w_demo_101', 'user_demo_101', 12000.00, 500.00, 'INR')
      ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO transactions (transaction_id, user_id, type, amount, status)
    VALUES ('tx_init_demo_101', 'user_demo_101', 'DEPOSIT', 12000.00, 'COMPLETED')
    ON CONFLICT (transaction_id) DO NOTHING;

    INSERT INTO ledger_entries (wallet_id, transaction_id, type, amount, balance_after, description)
    VALUES ('w_demo_101', 'tx_init_demo_101', 'CREDIT', 12000.00, 12000.00, 'Initial Account Deposit')
    ON CONFLICT DO NOTHING;
    `);

    // 3. Seed Sports & Competitions
    await client.query(`
      INSERT INTO sports (sport_id, name, slug, display_order)
      VALUES ('sport_cric', 'Cricket', 'cricket', 1),
             ('sport_soc', 'Soccer', 'soccer', 2)
      ON CONFLICT (sport_id) DO NOTHING;

      INSERT INTO competitions (competition_id, sport_id, name, country)
      VALUES ('comp_t20', 'sport_cric', 'Pakistan tour of West Indies, 2026', 'International')
      ON CONFLICT (competition_id) DO NOTHING;
    `);

    // 4. Seed Teams & Players
    await client.query(`
      INSERT INTO teams (team_id, name, short_name, sport_id)
      VALUES ('team_wi', 'West Indies', 'WI', 'sport_cric'),
             ('team_pak', 'Pakistan', 'PAK', 'sport_cric')
      ON CONFLICT (team_id) DO NOTHING;

      INSERT INTO players (player_id, name, team_id, role)
      VALUES ('p_wi_1', 'Kraigg Brathwaite', 'team_wi', 'Batter'),
             ('p_pak_1', 'Babar Azam', 'team_pak', 'Batter'),
             ('p_pak_2', 'Shaheen Afridi', 'team_pak', 'Bowler')
      ON CONFLICT (player_id) DO NOTHING;
    `);

    // 5. Seed Matches & Match Players Junction Table
    await client.query(`
      INSERT INTO matches (match_id, competition_id, team1_id, team2_id, status, live_score1, live_score2)
      VALUES ('match_wi_pak_2026', 'comp_t20', 'team_wi', 'team_pak', 'LIVE', '312/10', '189/4')
      ON CONFLICT (match_id) DO NOTHING;

      INSERT INTO match_players (match_id, team_id, player_id, provider_player_id, status)
      VALUES ('match_wi_pak_2026', 'team_wi', 'p_wi_1', 'prov_wi_1', 'ACTIVE'),
             ('match_wi_pak_2026', 'team_pak', 'p_pak_1', 'prov_pak_1', 'ACTIVE'),
             ('match_wi_pak_2026', 'team_pak', 'p_pak_2', 'prov_pak_2', 'ACTIVE')
      ON CONFLICT (match_id, team_id, player_id) DO NOTHING;
    `);

    // 6. Seed Support Conversations & Messages
    await client.query(`
      INSERT INTO support_conversations (conversation_id, user_id, tenant_id, assigned_agent, assigned_team, category, priority, status)
      VALUES ('conv_demo_9912', 'user_demo_101', 'betking_in', 'Priya Sharma', 'PAYMENTS', 'WITHDRAWAL', 'HIGH', 'OPEN')
      ON CONFLICT (conversation_id) DO NOTHING;

      INSERT INTO support_messages (message_id, conversation_id, sender, agent_name, text)
      VALUES ('msg_seed_1', 'conv_demo_9912', 'customer', NULL, 'I want to know the status of my kyc'),
             ('msg_seed_2', 'conv_demo_9912', 'agent', 'Priya Sharma', 'Your KYC status is VERIFIED ✅. Account is fully unlocked for instant withdrawals!')
      ON CONFLICT (message_id) DO NOTHING;

      INSERT INTO support_feedback (feedback_id, conversation_id, rating, comment)
      VALUES ('fb_seed_1', 'conv_demo_9912', 5, 'Great fast support!')
      ON CONFLICT (conversation_id) DO NOTHING;
    `);

    await client.query('COMMIT');
    console.log('🎉 SEED DATA CREATED SUCCESSFULLY FOR LOCAL DEVELOPMENT!\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ SEEDING FAILED:', err.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

seedDevelopmentData();
