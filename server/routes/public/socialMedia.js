/**
 * Public social media asset URLs for Instagram Graph API image_url fetch.
 * Token in path is the only auth — unguessable 48-char hex.
 */

import { Router } from 'express';
import path from 'path';
import { getSocialUploadDir, readSocialImage } from '../../../lib/socialMediaAssets.mjs';

const router = Router();

let pgQuery = null;
async function getQuery() {
  if (!pgQuery) {
    const m = await import('../../../db/pg.js');
    pgQuery = m.query;
  }
  return pgQuery;
}

router.get('/assets/:token', async (req, res) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!/^[a-f0-9]{32,64}$/i.test(token)) {
      return res.status(404).send('Not found');
    }

    const q = await getQuery();
    const result = await q(
      `SELECT image_storage_path, image_mime, image_file_name
       FROM admin_social_posts
       WHERE image_public_token = $1
       LIMIT 1`,
      [token],
    );
    const row = result.rows[0];
    if (!row?.image_storage_path) {
      return res.status(404).send('Not found');
    }

    // Path traversal guard — must stay under social upload dir
    const uploadDir = path.resolve(getSocialUploadDir());
    const resolved = path.resolve(row.image_storage_path);
    if (!resolved.startsWith(uploadDir + path.sep) && resolved !== uploadDir) {
      return res.status(404).send('Not found');
    }

    const buffer = await readSocialImage(resolved);
    const mime = row.image_mime || 'image/jpeg';
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (row.image_file_name) {
      res.setHeader('Content-Disposition', `inline; filename="${String(row.image_file_name).replace(/"/g, '')}"`);
    }
    return res.send(buffer);
  } catch (err) {
    if (err?.code === 'ENOENT') return res.status(404).send('Not found');
    return res.status(500).send('Error');
  }
});

export default router;
