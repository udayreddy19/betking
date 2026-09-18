/**
 * Admin Social Media — compose + auto-publish to Instagram via Graph API.
 */

import { Router } from 'express';
import { requirePermission } from '../../middleware/adminAuth.js';
import { logAdminAction } from '../../middleware/auditLogger.js';
import {
  saveSocialImage,
  buildPublicAssetUrl,
  deleteSocialImage,
  MAX_SOCIAL_IMAGE_BYTES,
} from '../../../lib/socialMediaAssets.mjs';
import {
  getInstagramConfig,
  instagramSetupHints,
  publishInstagramImage,
} from '../../../lib/instagramPublisher.mjs';

const router = Router();

let pgQuery = null;
async function getQuery() {
  if (!pgQuery) {
    const m = await import('../../../db/pg.js');
    pgQuery = m.query;
  }
  return pgQuery;
}

function genId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function ensureTable() {
  const q = await getQuery();
  await q(`CREATE TABLE IF NOT EXISTS admin_social_posts (
    post_id VARCHAR(64) PRIMARY KEY,
    admin_id VARCHAR(64) NOT NULL,
    platform VARCHAR(32) NOT NULL DEFAULT 'INSTAGRAM',
    media_type VARCHAR(32) NOT NULL DEFAULT 'FEED'
      CHECK (media_type IN ('FEED', 'STORY')),
    caption TEXT NOT NULL DEFAULT '',
    image_storage_path TEXT,
    image_public_token VARCHAR(128),
    image_mime VARCHAR(64),
    image_file_name VARCHAR(255),
    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT'
      CHECK (status IN ('DRAFT', 'QUEUED', 'PUBLISHING', 'PUBLISHED', 'FAILED')),
    external_container_id VARCHAR(128),
    external_post_id VARCHAR(128),
    error_message TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    tenant_id VARCHAR(64) NOT NULL DEFAULT 'oddsyra_in',
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
}

function rowToPost(row) {
  if (!row) return null;
  return {
    id: row.post_id,
    adminId: row.admin_id,
    platform: row.platform,
    mediaType: row.media_type,
    caption: row.caption,
    imageFileName: row.image_file_name,
    imageMime: row.image_mime,
    imageUrl: row.image_public_token ? buildPublicAssetUrl(row.image_public_token) : null,
    status: row.status,
    externalContainerId: row.external_container_id,
    externalPostId: row.external_post_id,
    errorMessage: row.error_message,
    metadata: row.metadata || {},
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.use(requirePermission('communications', 'growth'));

router.get('/status', async (_req, res) => {
  try {
    const config = getInstagramConfig();
    res.json({
      configured: config.configured,
      platform: 'INSTAGRAM',
      accountIdConfigured: Boolean(config.accountId),
      graphVersion: config.graphVersion,
      maxImageBytes: MAX_SOCIAL_IMAGE_BYTES,
      setup: config.configured ? null : instagramSetupHints(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/posts', async (req, res) => {
  try {
    await ensureTable();
    const q = await getQuery();
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));
    const result = await q(
      `SELECT * FROM admin_social_posts
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [req.admin.tenant || 'oddsyra_in', limit],
    );
    res.json({ posts: result.rows.map(rowToPost) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/posts/:id', async (req, res) => {
  try {
    await ensureTable();
    const q = await getQuery();
    const result = await q(
      'SELECT * FROM admin_social_posts WHERE post_id = $1 AND tenant_id = $2',
      [req.params.id, req.admin.tenant || 'oddsyra_in'],
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Post not found' });
    res.json({ post: rowToPost(result.rows[0]) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Create draft or publish immediately.
 * Body: { caption, mediaType, publishNow, image: { fileName, fileType, fileSize, base64Data } }
 */
router.post('/posts', async (req, res) => {
  let savedImage = null;
  try {
    await ensureTable();
    const q = await getQuery();
    const caption = String(req.body?.caption || '').trim();
    const mediaType = String(req.body?.mediaType || 'FEED').toUpperCase() === 'STORY' ? 'STORY' : 'FEED';
    const publishNow = req.body?.publishNow !== false;
    const image = req.body?.image || {};

    if (!image?.base64Data) {
      return res.status(400).json({ error: 'Image is required (JPEG or PNG)' });
    }
    if (mediaType === 'FEED' && !caption) {
      return res.status(400).json({ error: 'Caption is required for feed posts' });
    }
    if (caption.length > 2200) {
      return res.status(400).json({ error: 'Caption must be 2200 characters or fewer' });
    }

    if (publishNow && !getInstagramConfig().configured) {
      return res.status(503).json({
        error: 'Instagram is not configured on the server',
        code: 'INSTAGRAM_NOT_CONFIGURED',
        setup: instagramSetupHints(),
      });
    }

    savedImage = await saveSocialImage({
      fileName: image.fileName,
      fileType: image.fileType,
      fileSize: image.fileSize,
      base64Data: image.base64Data,
    });

    const postId = genId('ig');
    const initialStatus = publishNow ? 'PUBLISHING' : 'DRAFT';

    await q(
      `INSERT INTO admin_social_posts (
        post_id, admin_id, platform, media_type, caption,
        image_storage_path, image_public_token, image_mime, image_file_name,
        status, tenant_id, metadata
      ) VALUES ($1,$2,'INSTAGRAM',$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
      [
        postId,
        req.admin.id,
        mediaType,
        caption,
        savedImage.storagePath,
        savedImage.publicToken,
        savedImage.mime,
        savedImage.fileName,
        initialStatus,
        req.admin.tenant || 'oddsyra_in',
        JSON.stringify({ source: 'admin_social', byteLength: savedImage.byteLength }),
      ],
    );

    await logAdminAction({
      actorId: req.admin.id,
      targetId: postId,
      action: publishNow ? 'SOCIAL_POST_PUBLISH_START' : 'SOCIAL_POST_DRAFT',
      details: { platform: 'INSTAGRAM', mediaType, captionLength: caption.length },
    });

    if (!publishNow) {
      const draft = await q('SELECT * FROM admin_social_posts WHERE post_id = $1', [postId]);
      return res.status(201).json({ post: rowToPost(draft.rows[0]), published: false });
    }

    try {
      const result = await publishInstagramImage({
        imageUrl: savedImage.publicUrl,
        caption,
        mediaType,
      });

      await q(
        `UPDATE admin_social_posts SET
          status = 'PUBLISHED',
          external_container_id = $2,
          external_post_id = $3,
          error_message = NULL,
          published_at = NOW(),
          updated_at = NOW()
         WHERE post_id = $1`,
        [postId, result.containerId, result.postId],
      );

      await logAdminAction({
        actorId: req.admin.id,
        targetId: postId,
        action: 'SOCIAL_POST_PUBLISHED',
        details: {
          platform: 'INSTAGRAM',
          mediaType,
          externalPostId: result.postId,
          containerId: result.containerId,
        },
      });

      const published = await q('SELECT * FROM admin_social_posts WHERE post_id = $1', [postId]);
      return res.status(201).json({
        post: rowToPost(published.rows[0]),
        published: true,
        externalPostId: result.postId,
      });
    } catch (publishErr) {
      await q(
        `UPDATE admin_social_posts SET
          status = 'FAILED',
          error_message = $2,
          updated_at = NOW()
         WHERE post_id = $1`,
        [postId, String(publishErr.message || 'Publish failed').slice(0, 1000)],
      );
      await logAdminAction({
        actorId: req.admin.id,
        targetId: postId,
        action: 'SOCIAL_POST_FAILED',
        details: { error: publishErr.message, code: publishErr.code },
      });
      const failed = await q('SELECT * FROM admin_social_posts WHERE post_id = $1', [postId]);
      return res.status(502).json({
        error: publishErr.message || 'Instagram publish failed',
        code: publishErr.code || 'INSTAGRAM_PUBLISH_FAILED',
        post: rowToPost(failed.rows[0]),
      });
    }
  } catch (err) {
    if (savedImage?.storagePath) {
      await deleteSocialImage(savedImage.storagePath).catch(() => null);
    }
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
});

/** Retry publish for DRAFT or FAILED posts */
router.post('/posts/:id/publish', async (req, res) => {
  try {
    await ensureTable();
    const q = await getQuery();
    const result = await q(
      'SELECT * FROM admin_social_posts WHERE post_id = $1 AND tenant_id = $2',
      [req.params.id, req.admin.tenant || 'oddsyra_in'],
    );
    const row = result.rows[0];
    if (!row) return res.status(404).json({ error: 'Post not found' });
    if (row.status === 'PUBLISHED') {
      return res.status(400).json({ error: 'Post is already published', post: rowToPost(row) });
    }
    if (!row.image_public_token || !row.image_storage_path) {
      return res.status(400).json({ error: 'Post has no image to publish' });
    }
    if (!getInstagramConfig().configured) {
      return res.status(503).json({
        error: 'Instagram is not configured on the server',
        code: 'INSTAGRAM_NOT_CONFIGURED',
        setup: instagramSetupHints(),
      });
    }

    await q(
      `UPDATE admin_social_posts SET status = 'PUBLISHING', error_message = NULL, updated_at = NOW()
       WHERE post_id = $1`,
      [row.post_id],
    );

    try {
      const published = await publishInstagramImage({
        imageUrl: buildPublicAssetUrl(row.image_public_token),
        caption: row.caption || '',
        mediaType: row.media_type,
      });
      await q(
        `UPDATE admin_social_posts SET
          status = 'PUBLISHED',
          external_container_id = $2,
          external_post_id = $3,
          error_message = NULL,
          published_at = NOW(),
          updated_at = NOW()
         WHERE post_id = $1`,
        [row.post_id, published.containerId, published.postId],
      );
      await logAdminAction({
        actorId: req.admin.id,
        targetId: row.post_id,
        action: 'SOCIAL_POST_PUBLISHED',
        details: { platform: 'INSTAGRAM', externalPostId: published.postId, retry: true },
      });
      const updated = await q('SELECT * FROM admin_social_posts WHERE post_id = $1', [row.post_id]);
      return res.json({ post: rowToPost(updated.rows[0]), published: true });
    } catch (publishErr) {
      await q(
        `UPDATE admin_social_posts SET status = 'FAILED', error_message = $2, updated_at = NOW()
         WHERE post_id = $1`,
        [row.post_id, String(publishErr.message || 'Publish failed').slice(0, 1000)],
      );
      return res.status(502).json({
        error: publishErr.message || 'Instagram publish failed',
        code: publishErr.code || 'INSTAGRAM_PUBLISH_FAILED',
      });
    }
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, code: err.code });
  }
});

router.delete('/posts/:id', async (req, res) => {
  try {
    await ensureTable();
    const q = await getQuery();
    const result = await q(
      'SELECT * FROM admin_social_posts WHERE post_id = $1 AND tenant_id = $2',
      [req.params.id, req.admin.tenant || 'oddsyra_in'],
    );
    const row = result.rows[0];
    if (!row) return res.status(404).json({ error: 'Post not found' });
    if (row.status === 'PUBLISHED') {
      return res.status(400).json({ error: 'Published posts cannot be deleted from admin (remove on Instagram instead)' });
    }
    await q('DELETE FROM admin_social_posts WHERE post_id = $1', [row.post_id]);
    await deleteSocialImage(row.image_storage_path);
    await logAdminAction({
      actorId: req.admin.id,
      targetId: row.post_id,
      action: 'SOCIAL_POST_DELETED',
      details: { status: row.status },
    });
    res.json({ deleted: true, id: row.post_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
