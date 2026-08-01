// Vercel Serverless API Function: Create Razorpay Order
// Route: /api/create-razorpay-order

import Razorpay from 'razorpay';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { amount, userId } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid deposit amount' });
  }

  const key_id = process.env.VITE_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || 'rzp_live_TKUn3mSbuhuzFx';
  const key_secret = process.env.RAZORPAY_KEY_SECRET || 'PmCgXVE0oIKPeQxRfXZgUFt2';

  if (!key_id || !key_secret) {
    return res.status(500).json({
      error: 'Razorpay API Keys not configured on server.'
    });
  }

  try {
    const instance = new Razorpay({ key_id, key_secret });

    const options = {
      amount: Math.round(amount * 100), // Amount in paise
      currency: 'INR',
      receipt: `rcpt_${userId || 'user'}_${Date.now()}`,
      notes: {
        userId: userId || 'udayreddy12',
      },
    };

    const order = await instance.orders.create(options);
    console.log('[Razorpay API] Real Order Created:', order.id);

    return res.status(200).json(order);
  } catch (err) {
    console.error('[Razorpay API Error]:', err);
    return res.status(500).json({ error: err.message || 'Error creating Razorpay order' });
  }
}
