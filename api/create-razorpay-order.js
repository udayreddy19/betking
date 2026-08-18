// Legacy Vercel route — disabled. Use authenticated POST /api/v1/payments/create-order instead.

export default async function handler(req, res) {
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
    return res.status(410).json({
      error: 'This endpoint is disabled. Use POST /api/v1/payments/create-order with authentication.',
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(410).json({
    error: 'Legacy unauthenticated order creation is disabled. Use the authenticated payments API.',
  });
}
