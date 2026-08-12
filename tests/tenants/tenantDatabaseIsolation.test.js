import { describe, it, expect } from 'vitest';
import { query } from '../../db/pg.js';

describe('Phase 14 Database Tenant Scoping & Isolation Tests', () => {
  it('Queries filtered by tenant_id return only matching tenant records', async () => {
    const runTag = Date.now();
    const userA = `usr_t_iso_a_${runTag}`;
    const userB = `usr_t_iso_b_${runTag}`;

    await query(`INSERT INTO users (user_id, email, password_hash, tenant_id) VALUES ($1, $2, 'hash', 'tenant_alpha') ON CONFLICT DO NOTHING;`, [userA, `${userA}@example.com`]);
    await query(`INSERT INTO users (user_id, email, password_hash, tenant_id) VALUES ($1, $2, 'hash', 'tenant_beta') ON CONFLICT DO NOTHING;`, [userB, `${userB}@example.com`]);

    const resA = await query(`SELECT user_id FROM users WHERE tenant_id = 'tenant_alpha' AND user_id = $1;`, [userA]);
    const resB = await query(`SELECT user_id FROM users WHERE tenant_id = 'tenant_beta' AND user_id = $1;`, [userA]);

    expect(resA.rows.length).toBe(1);
    expect(resB.rows.length).toBe(0); // Tenant Alpha user cannot be found in Tenant Beta query
  });
});
