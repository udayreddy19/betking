import { handleCricbuzzRequest } from '../lib/cricbuzzHandler.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const query = req.query || {};
  const result = await handleCricbuzzRequest(query);

  if (result.error) {
    return res.status(result.status || 500).json({ error: result.error });
  }

  return res.status(200).json(result.data);
}
