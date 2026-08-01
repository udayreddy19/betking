// Node.js / Express Backend Server with Razorpay Webhook Handler
// Usage: node server/index.js

const express = require('express');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// IMPORTANT: Razorpay Webhooks MUST receive the RAW request body to verify HMAC signatures accurately.
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(cors());

// Razorpay Credentials & Webhook Secret
const RAZORPAY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'YOUR_RAZORPAY_KEY_SECRET';
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || 'betking_wh_secret_2026';

// -----------------------------------------------------------------------------
// 1. Create Razorpay Order API (Called from Frontend before Checkout)
// -----------------------------------------------------------------------------
app.post('/api/create-order', async (req, res) => {
  const { amount, userId } = req.body;
  
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid deposit amount' });
  }

  try {
    // If using razorpay SDK:
    // const order = await razorpayInstance.orders.create({
    //   amount: amount * 100, // paise
    //   currency: 'INR',
    //   receipt: `rcpt_${userId}_${Date.now()}`,
    //   notes: { userId: userId || 'udayreddy12' }
    // });
    
    // Mock response format matching Razorpay API:
    const mockOrder = {
      id: `order_${Math.random().toString(36).substring(2, 12)}`,
      entity: 'order',
      amount: amount * 100,
      amount_paid: 0,
      amount_due: amount * 100,
      currency: 'INR',
      receipt: `rcpt_${userId || 'user123'}_${Date.now()}`,
      status: 'created',
      notes: { userId: userId || 'udayreddy12' }
    };

    console.log(`[API] Order created: ${mockOrder.id} for ₹${amount}`);
    res.json(mockOrder);
  } catch (err) {
    console.error('[API Error] Failed to create order:', err);
    res.status(500).json({ error: 'Server error creating order' });
  }
});

// -----------------------------------------------------------------------------
// 2. Razorpay Webhook Endpoint (Configured in Razorpay Dashboard)
// -----------------------------------------------------------------------------
app.post('/api/webhooks/razorpay', (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'betking_wh_secret_2026';

  // Security Check 1: Ensure signature header exists
  if (!signature) {
    console.warn('[Webhook Warning] Missing x-razorpay-signature header');
    return res.status(400).json({ error: 'Missing signature' });
  }

  // Security Check 2: Verify HMAC SHA256 signature using raw body & secret
  const hmac = crypto.createHmac('sha256', webhookSecret);
  hmac.update(req.rawBody);
  const digest = hmac.digest('hex');

  if (digest !== signature) {
    console.error('[Webhook Error] Invalid signature match! Possible unauthorized request.');
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  // Signature Verified! Extract payload and event type
  const event = req.body.event;
  const payload = req.body.payload;

  console.log(`\n======================================================`);
  console.log(`[VERIFIED WEBHOOK EVENT]: ${event}`);
  console.log(`======================================================`);

  switch (event) {
    case 'payment.captured': {
      const payment = payload.payment.entity;
      const amountInINR = payment.amount / 100;
      const userId = payment.notes?.userId || 'udayreddy12';
      const paymentId = payment.id;
      const orderId = payment.order_id;
      const method = payment.method; // 'upi', 'card', 'netbanking'

      console.log(`[SUCCESS] Payment Captured!`);
      console.log(` -> Payment ID : ${paymentId}`);
      console.log(` -> Order ID   : ${orderId}`);
      console.log(` -> User ID    : ${userId}`);
      console.log(` -> Amount     : ₹${amountInINR}`);
      console.log(` -> Method     : ${method}`);

      // TODO: Update your Database here!
      // await db.users.update({ username: userId }, { $inc: { balance: amountInINR } });
      // await db.transactions.create({ userId, amount: amountInINR, paymentId, status: 'SUCCESS' });
      break;
    }

    case 'payment.failed': {
      const payment = payload.payment.entity;
      const errorReason = payment.error_description || 'Unknown error';
      console.log(`[FAILED] Payment Failed for ${payment.id}: ${errorReason}`);
      break;
    }

    case 'refund.processed': {
      const refund = payload.refund.entity;
      console.log(`[REFUND] Refund Processed for Payment ${refund.payment_id}: ₹${refund.amount / 100}`);
      break;
    }

    default:
      console.log(`[INFO] Unhandled event type: ${event}`);
  }

  // Acknowledge receipt to Razorpay (Must respond within 5 seconds with 200 OK)
  res.status(200).json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`🚀 BetKing Razorpay Webhook Backend listening on http://localhost:${PORT}`);
  console.log(`  - Webhook Route : http://localhost:${PORT}/api/webhooks/razorpay`);
  console.log(`  - Order Route   : http://localhost:${PORT}/api/create-order`);
});
