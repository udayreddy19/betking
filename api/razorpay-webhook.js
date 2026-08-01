// Vercel Serverless API Function: Razorpay Webhook Handler
// Route: /api/razorpay-webhook

import crypto from 'crypto';

export const config = {
  api: {
    bodyParser: false, // Disabling bodyParser to get raw buffer for signature verification
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

    if (webhookSecret && signature) {
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawBody)
        .digest('hex');

      if (expectedSignature !== signature) {
        console.error('[Webhook Error] Invalid signature');
        return res.status(400).json({ error: 'Invalid signature' });
      }
    }

    const payloadText = rawBody.toString('utf8');
    const body = JSON.parse(payloadText);
    const event = body.event;
    const payload = body.payload;

    console.log(`[Vercel Webhook] Event received: ${event}`);

    if (event === 'payment.captured') {
      const payment = payload.payment.entity;
      const amountINR = payment.amount / 100;
      const userId = payment.notes?.userId || 'udayreddy12';

      console.log(`✅ REAL PAYMENT CAPTURED! ₹${amountINR} paid by ${userId} via ${payment.method}`);
      // In production, update database user account balance here!
    }

    return res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('[Webhook Exception]:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
