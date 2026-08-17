// Vercel Serverless API Function: Razorpay Webhook Handler
// Route: /api/razorpay-webhook

import crypto from 'crypto';
import { timingSafeEqualStrings } from '../lib/cryptoUtils.mjs';

export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const rawBody = await getRawBody(req);
    const signature = req.headers['x-razorpay-signature'];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!webhookSecret) {
      return res.status(503).json({ error: 'Webhook secret not configured' });
    }
    if (!signature) {
      return res.status(403).json({ error: 'Missing signature' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    if (!timingSafeEqualStrings(expectedSignature, signature)) {
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const body = JSON.parse(rawBody.toString('utf8'));
    const { depositEngine } = await import('../lib/depositEngine.mjs');
    const result = await depositEngine.processWebhook({
      rawBody,
      signature,
      payload: body.payload,
      event: body.event,
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error('[Webhook Exception]:', err.message);
    const status = err.message?.includes('INVALID_SIGNATURE') || err.message?.includes('MISSING_SIGNATURE')
      ? 400
      : 500;
    return res.status(status).json({ error: err.message || 'Server error' });
  }
}
