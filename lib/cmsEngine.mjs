/**
 * Content Management System Engine — OddsYra Enterprise Platform
 * 
 * Manages banners, promotions, announcements, FAQs, help content,
 * responsible gaming content, terms, and campaign content.
 * 
 * Lifecycle: DRAFT → REVIEW → PUBLISHED → SCHEDULED → EXPIRED → ARCHIVED
 * Supports: version history, audit trail, tenant scoping.
 */

import { query } from '../db/pg.js';

/**
 * Create a new content item.
 */
export async function createContent({
  contentType,
  title,
  body,
  slug = null,
  mediaUrl = null,
  metadata = {},
  tenantId = 'tenant_default',
  createdBy = 'admin',
}) {
  const VALID_TYPES = ['BANNER', 'PROMOTION', 'ANNOUNCEMENT', 'FAQ', 'HELP', 'TERMS', 'CAMPAIGN', 'RESPONSIBLE_GAMING'];
  if (!VALID_TYPES.includes(contentType)) {
    throw new Error(`Invalid content type: ${contentType}. Must be one of: ${VALID_TYPES.join(', ')}`);
  }

  const id = `cms_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const contentSlug = slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  await query(`
    INSERT INTO cms_content (id, content_type, title, slug, body, media_url, metadata, status, version, tenant_id, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'DRAFT', 1, $8, $9);
  `, [id, contentType, title, contentSlug, body, mediaUrl, JSON.stringify(metadata), tenantId, createdBy]);

  // Save initial version
  await query(`
    INSERT INTO cms_content_versions (content_id, version, title, body, metadata, edited_by)
    VALUES ($1, 1, $2, $3, $4, $5);
  `, [id, title, body, JSON.stringify(metadata), createdBy]);

  return {
    success: true,
    contentId: id,
    contentType,
    title,
    slug: contentSlug,
    status: 'DRAFT',
    version: 1,
  };
}

/**
 * Update content and create a new version.
 */
export async function updateContent(contentId, { title, body, mediaUrl, metadata, updatedBy = 'admin' }) {
  const existing = await query(`SELECT id, version, status FROM cms_content WHERE id = $1;`, [contentId]);
  if (existing.rows.length === 0) throw new Error('Content not found');

  const newVersion = existing.rows[0].version + 1;

  await query(`
    UPDATE cms_content
    SET title = COALESCE($2, title),
        body = COALESCE($3, body),
        media_url = COALESCE($4, media_url),
        metadata = COALESCE($5, metadata),
        version = $6,
        updated_by = $7,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1;
  `, [contentId, title, body, mediaUrl, metadata ? JSON.stringify(metadata) : null, newVersion, updatedBy]);

  // Save version snapshot
  await query(`
    INSERT INTO cms_content_versions (content_id, version, title, body, metadata, edited_by)
    VALUES ($1, $2, $3, $4, $5, $6);
  `, [contentId, newVersion, title || existing.rows[0].title, body || '', JSON.stringify(metadata || {}), updatedBy]);

  return { success: true, contentId, version: newVersion };
}

/**
 * Transition content status with validation.
 */
export async function transitionContentStatus(contentId, { newStatus, actorId = 'admin', scheduledAt = null, expiresAt = null }) {
  const VALID_TRANSITIONS = {
    'DRAFT': ['REVIEW', 'PUBLISHED', 'ARCHIVED'],
    'REVIEW': ['PUBLISHED', 'DRAFT', 'ARCHIVED'],
    'PUBLISHED': ['EXPIRED', 'ARCHIVED', 'DRAFT'],
    'SCHEDULED': ['PUBLISHED', 'ARCHIVED', 'DRAFT'],
    'EXPIRED': ['DRAFT', 'ARCHIVED'],
    'ARCHIVED': ['DRAFT'],
  };

  const existing = await query(`SELECT id, status FROM cms_content WHERE id = $1;`, [contentId]);
  if (existing.rows.length === 0) throw new Error('Content not found');

  const currentStatus = existing.rows[0].status;
  const allowed = VALID_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(newStatus)) {
    throw new Error(`Invalid transition: ${currentStatus} → ${newStatus}. Allowed: ${allowed.join(', ')}`);
  }

  const updates = [`status = $2`, `updated_by = $3`, `updated_at = CURRENT_TIMESTAMP`];
  const params = [contentId, newStatus, actorId];

  if (newStatus === 'PUBLISHED') {
    updates.push(`published_at = CURRENT_TIMESTAMP`);
  }
  if (newStatus === 'SCHEDULED' && scheduledAt) {
    updates.push(`scheduled_at = $${params.length + 1}`);
    params.push(scheduledAt);
  }
  if (expiresAt) {
    updates.push(`expires_at = $${params.length + 1}`);
    params.push(expiresAt);
  }

  await query(`UPDATE cms_content SET ${updates.join(', ')} WHERE id = $1;`, params);

  return { success: true, contentId, previousStatus: currentStatus, newStatus };
}

/**
 * Get content items by type and status.
 */
export async function getContentByType(contentType, { status = null, tenantId = 'tenant_default', limit = 50 } = {}) {
  let sql = `
    SELECT id, content_type, title, slug, body, media_url, metadata, status, version,
           tenant_id, published_at, scheduled_at, expires_at, created_by, created_at, updated_at
    FROM cms_content
    WHERE content_type = $1 AND tenant_id = $2
  `;
  const params = [contentType, tenantId];

  if (status) {
    sql += ` AND status = $3`;
    params.push(status);
  }

  sql += ` ORDER BY updated_at DESC LIMIT ${limit};`;

  const res = await query(sql, params);
  return { success: true, count: res.rows.length, content: res.rows };
}

/**
 * Get version history for a content item.
 */
export async function getContentVersionHistory(contentId) {
  const res = await query(`
    SELECT version, title, body, metadata, edited_by, created_at
    FROM cms_content_versions
    WHERE content_id = $1
    ORDER BY version DESC;
  `, [contentId]);
  return { success: true, contentId, versions: res.rows };
}

/**
 * Get published content for user-facing display.
 */
export async function getPublishedContent(contentType, { tenantId = 'tenant_default', limit = 20 } = {}) {
  const res = await query(`
    SELECT id, content_type, title, slug, body, media_url, metadata, published_at
    FROM cms_content
    WHERE content_type = $1 AND tenant_id = $2 AND status = 'PUBLISHED'
      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
    ORDER BY published_at DESC
    LIMIT $3;
  `, [contentType, tenantId, limit]);
  return { success: true, count: res.rows.length, content: res.rows };
}
