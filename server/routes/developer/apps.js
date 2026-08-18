import { Router } from 'express';
import {
  createDeveloperApp,
  generateApiKey,
  revokeApiKey,
  rotateApiKey,
  createWebhookSubscription,
} from '../../../lib/developerPlatformEngine.mjs';
import { query } from '../../../db/pg.js';
import { adminAuth } from '../../middleware/adminAuth.js';

const router = Router();

router.use(adminAuth);

// POST /api/developer/apps — Create Developer App
router.post('/apps', async (req, res) => {
  try {
    const { name, description, environment } = req.body;
    if (!name) return res.status(400).json({ error: 'Application name is required' });

    const app = await createDeveloperApp({
      userId: req.admin.id,
      name,
      description,
      environment,
    });
    res.json(app);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/developer/apps — List User's Developer Apps
router.get('/apps', async (req, res) => {
  try {
    const appsRes = await query(`
      SELECT id, name, description, environment, status, created_at
      FROM developer_apps
      WHERE user_id = $1 ORDER BY created_at DESC;
    `, [req.admin.id]);
    res.json({ success: true, apps: appsRes.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/developer/apps/:id/keys — Generate API Key
router.post('/apps/:id/keys', async (req, res) => {
  try {
    const appId = req.params.id;
    const { scopes, environment } = req.body;

    // Verify app ownership
    const appCheck = await query(`SELECT id FROM developer_apps WHERE id = $1 AND user_id = $2;`, [appId, req.admin.id]);
    if (appCheck.rows.length === 0) return res.status(404).json({ error: 'Developer application not found or unauthorized' });

    const key = await generateApiKey({
      appId,
      scopes: scopes || ['sports:read', 'matches:read', 'odds:read'],
      environment: environment || 'PRODUCTION',
    });
    res.json(key);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/developer/keys/:id/rotate — Rotate API Key
router.post('/keys/:id/rotate', async (req, res) => {
  try {
    const keyId = req.params.id;
    const rotated = await rotateApiKey(keyId, req.admin.id);
    res.json(rotated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/developer/keys/:id/revoke — Revoke API Key
router.post('/keys/:id/revoke', async (req, res) => {
  try {
    const keyId = req.params.id;
    const revoked = await revokeApiKey(keyId, req.admin.id);
    res.json(revoked);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/developer/apps/:id/webhooks — Create Webhook Subscription (SSRF Defense)
router.post('/apps/:id/webhooks', async (req, res) => {
  try {
    const appId = req.params.id;
    const { targetUrl, subscribedEvents } = req.body;

    const appCheck = await query(`SELECT id FROM developer_apps WHERE id = $1 AND user_id = $2;`, [appId, req.admin.id]);
    if (appCheck.rows.length === 0) return res.status(404).json({ error: 'Developer application not found or unauthorized' });

    const sub = await createWebhookSubscription({
      appId,
      targetUrl,
      subscribedEvents: subscribedEvents || ['match.updated', 'odds.updated'],
    });
    res.json(sub);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/developer/apps/:id/webhooks — List Webhook Subscriptions & Delivery Logs
router.get('/apps/:id/webhooks', async (req, res) => {
  try {
    const appId = req.params.id;
    const appCheck = await query(`SELECT id FROM developer_apps WHERE id = $1 AND user_id = $2;`, [appId, req.admin.id]);
    if (appCheck.rows.length === 0) return res.status(404).json({ error: 'Developer application not found or unauthorized' });

    const subsRes = await query(`
      SELECT id, target_url, subscribed_events, status, created_at
      FROM webhook_subscriptions WHERE app_id = $1;
    `, [appId]);

    res.json({ success: true, subscriptions: subsRes.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
