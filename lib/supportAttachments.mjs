/**
 * Support chat attachments — disk store + support_attachments rows.
 * Allowed: images (jpg/png/gif/webp/heic/heif), Word, Excel, PDF, TXT.
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { query } from '../db/pg.js';

export const MAX_SUPPORT_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const SUPPORT_ATTACHMENT_ACCEPT =
  '.jpg,.jpeg,.png,.gif,.webp,.heic,.heif,.doc,.docx,.xls,.xlsx,.pdf,.txt,image/*';

const EXT_TO_MIME = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
  txt: 'text/plain',
};

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/pdf',
  'text/plain',
]);

export function getSupportUploadDir() {
  return process.env.SUPPORT_UPLOAD_DIR
    || path.join(process.cwd(), 'data', 'support_attachments');
}

function extOf(fileName = '') {
  const parts = String(fileName).toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
}

export function resolveSupportAttachmentMime(fileName, fileType) {
  const raw = String(fileType || '').trim().toLowerCase();
  if (raw.includes('svg') || raw.includes('xml')) return 'application/octet-stream';
  if (raw && ALLOWED_MIME.has(raw)) return raw;
  if (raw.startsWith('image/') && !raw.includes('svg')) return raw;
  const ext = extOf(fileName);
  if (['svg', 'svgz', 'xml', 'html', 'htm'].includes(ext)) return 'application/octet-stream';
  return EXT_TO_MIME[ext] || raw || '';
}

export function isAllowedSupportAttachment(fileName, fileType) {
  const mime = resolveSupportAttachmentMime(fileName, fileType);
  const ext = extOf(fileName);
  if (['svg', 'svgz', 'xml', 'html', 'htm'].includes(ext)) return false;
  if (String(mime || '').toLowerCase().includes('svg') || String(mime || '').toLowerCase().includes('xml')) {
    return false;
  }
  if (ALLOWED_MIME.has(mime)) return true;
  if (String(mime).startsWith('image/') && !String(mime).includes('svg')) return true;
  if (EXT_TO_MIME[ext] && EXT_TO_MIME[ext] !== 'image/svg+xml') return true;
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tif', 'tiff', 'avif'].includes(ext);
}

export function isPreviewableImageMime(mime) {
  const m = String(mime || '').toLowerCase();
  return m.startsWith('image/') && !m.includes('heic') && !m.includes('heif') && !m.includes('svg');
}

function sanitizeFileName(name) {
  return String(name || 'file')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 180) || 'file';
}

function decodeBase64Payload(base64Data) {
  const raw = String(base64Data || '');
  const comma = raw.indexOf(',');
  const payload = raw.startsWith('data:') && comma >= 0 ? raw.slice(comma + 1) : raw;
  return Buffer.from(payload, 'base64');
}

export async function saveSupportAttachment({
  fileName,
  fileType,
  fileSize,
  base64Data,
  uploadedBy,
  conversationId = null,
  messageId = null,
  uploadedByRole = 'user',
} = {}) {
  if (!fileName) {
    const err = new Error('fileName is required');
    err.status = 400;
    throw err;
  }
  let mime = resolveSupportAttachmentMime(fileName, fileType);
  if (!isAllowedSupportAttachment(fileName, mime)) {
    const err = new Error('Unsupported file type. Allowed: images, DOC, DOCX, XLS, XLSX, PDF, TXT.');
    err.status = 400;
    throw err;
  }
  if (!mime && String(fileType || '').toLowerCase().startsWith('image/')) {
    mime = String(fileType).toLowerCase();
  }
  if (!mime) mime = EXT_TO_MIME[extOf(fileName)] || 'application/octet-stream';
  if (!base64Data) {
    const err = new Error('base64Data is required');
    err.status = 400;
    throw err;
  }

  const buffer = decodeBase64Payload(base64Data);
  const size = buffer.length || Number(fileSize) || 0;
  if (!size) {
    const err = new Error('Empty file');
    err.status = 400;
    throw err;
  }
  if (size > MAX_SUPPORT_ATTACHMENT_BYTES) {
    const err = new Error('File size exceeds maximum allowed limit of 10MB.');
    err.status = 400;
    throw err;
  }

  const attachmentId = `att_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
  const safeName = sanitizeFileName(fileName);
  const ownerKey = String(uploadedBy || 'anon').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  const dir = path.join(getSupportUploadDir(), ownerKey);
  await fs.mkdir(dir, { recursive: true });
  const diskName = `${attachmentId}_${safeName}`;
  const absPath = path.join(dir, diskName);
  await fs.writeFile(absPath, buffer);

  const storagePath = path.join(ownerKey, diskName);
  const url = `/api/v1/support/attachments/${attachmentId}`;

  try {
    await query(
      `INSERT INTO support_attachments
         (attachment_id, message_id, conversation_id, file_name, file_type, file_size, storage_path)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        attachmentId,
        messageId || null,
        conversationId || null,
        safeName,
        mime,
        size,
        storagePath,
      ],
    );
  } catch (err) {
    await fs.unlink(absPath).catch(() => null);
    throw err;
  }

  return {
    attachmentId,
    fileName: safeName,
    fileType: mime,
    fileSize: size,
    storagePath,
    url,
    previewable: isPreviewableImageMime(mime),
    uploadedBy: uploadedBy || null,
    uploadedByRole,
    createdAt: new Date().toISOString(),
  };
}

export async function linkAttachmentsToMessage({
  attachmentIds = [],
  messageId,
  conversationId,
  uploadedBy = null,
} = {}) {
  const ids = (attachmentIds || []).filter(Boolean);
  if (!ids.length || !messageId) return;
  const ownerKey = String(uploadedBy || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  if (ownerKey) {
    await query(
      `UPDATE support_attachments
       SET message_id = $1,
           conversation_id = COALESCE(NULLIF($2, ''), conversation_id)
       WHERE attachment_id = ANY($3::text[])
         AND storage_path LIKE $4`,
      [messageId, conversationId || null, ids, `${ownerKey}/%`],
    ).catch(() => null);
    return;
  }
  await query(
    `UPDATE support_attachments
     SET message_id = $1,
         conversation_id = COALESCE(NULLIF($2, ''), conversation_id)
     WHERE attachment_id = ANY($3::text[])`,
    [messageId, conversationId || null, ids],
  ).catch(() => null);
}

export async function getSupportAttachmentRecord(attachmentId) {
  const res = await query(
    `SELECT attachment_id, message_id, conversation_id, file_name, file_type, file_size, storage_path, created_at
     FROM support_attachments WHERE attachment_id = $1 LIMIT 1`,
    [attachmentId],
  );
  return res.rows[0] || null;
}

export async function readSupportAttachmentFile(record) {
  if (!record?.storage_path) return null;
  const abs = path.join(getSupportUploadDir(), record.storage_path);
  const root = path.resolve(getSupportUploadDir());
  const resolved = path.resolve(abs);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw Object.assign(new Error('Invalid storage path'), { status: 400 });
  }
  return fs.readFile(resolved);
}

export async function userCanAccessAttachment(record, userId) {
  if (!record) return false;
  if (!record.conversation_id || record.conversation_id === 'pending') {
    // Pending uploads: allow if path is under this user folder
    return String(record.storage_path || '').startsWith(`${String(userId).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)}/`);
  }
  const conv = await query(
    `SELECT user_id FROM support_conversations WHERE conversation_id = $1 LIMIT 1`,
    [record.conversation_id],
  ).catch(() => ({ rows: [] }));
  return conv.rows[0]?.user_id === userId;
}
