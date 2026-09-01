/**
 * Disabled Vercel serverless stubs. Use the authenticated Express API instead.
 */
export default function handler(_req, res) {
  return res.status(410).json({
    error: 'This endpoint is disabled. Use the authenticated Express API.',
  });
}
