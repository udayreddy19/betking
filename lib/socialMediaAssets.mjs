/**
 * Social media image assets — disk store + public token URLs for Instagram Graph API.
 * Meta fetches image_url over HTTPS without auth, so tokens are unguessable and short-lived enough via opacity.
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export const MAX_SOCIAL_IMAGE_BYTES = 8 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
]);

const EXT_TO_MIME = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

export function getSocialUploadDir() {
  return process.env.SOCIAL_MEDIA_UPLOAD_DIR
    || path.join(process.cwd(), 'data', 'social_media');
}

function extOf(fileName = '') {
  const parts = String(fileName).toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
}

function sanitizeFileName(name) {
  return String(name || 'image')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 160) || 'image';
}

function decodeBase64Payload(base64Data) {
  const raw = String(base64Data || '');
  const comma = raw.indexOf(',');
  const payload = raw.startsWith('data:') && comma >= 0 ? raw.slice(comma + 1) : raw;
  return Buffer.from(payload, 'base64');
}

export function resolveSocialImageMime(fileName, fileType) {
  const raw = String(fileType || '').trim().toLowerCase();
  if (raw === 'image/jpg') return 'image/jpeg';
  if (ALLOWED_MIME.has(raw)) return raw;
  const ext = extOf(fileName);
  return EXT_TO_MIME[ext] || '';
}

export function isAllowedSocialImage(fileName, fileType) {
  const mime = resolveSocialImageMime(fileName, fileType);
  return ALLOWED_MIME.has(mime);
}

export function publicSocialBaseUrl() {
  const base = (
    process.env.SOCIAL_MEDIA_PUBLIC_BASE_URL
    || process.env.APP_URL
    || process.env.FRONTEND_URL
    || 'https://oddsyra.com'
  ).replace(/\/$/, '');
  return base;
}

export function buildPublicAssetUrl(token) {
  return `${publicSocialBaseUrl()}/api/public/social-media/assets/${encodeURIComponent(token)}`;
}

/**
 * Persist image bytes to disk. Returns storage path + public token.
 */
export async function saveSocialImage({
  fileName,
  fileType,
  fileSize,
  base64Data,
} = {}) {
  if (!fileName) {
    const err = new Error('Image fileName is required');
    err.status = 400;
    throw err;
  }
  const mime = resolveSocialImageMime(fileName, fileType);
  if (!isAllowedSocialImage(fileName, mime)) {
    const err = new Error('Instagram only accepts JPEG or PNG images');
    err.status = 400;
    throw err;
  }

  const buffer = decodeBase64Payload(base64Data);
  if (!buffer.length) {
    const err = new Error('Image data is empty');
    err.status = 400;
    throw err;
  }
  const declared = Number(fileSize) || buffer.length;
  if (buffer.length > MAX_SOCIAL_IMAGE_BYTES || declared > MAX_SOCIAL_IMAGE_BYTES) {
    const err = new Error('Image must be 8MB or smaller');
    err.status = 400;
    throw err;
  }

  const dir = getSocialUploadDir();
  await fs.mkdir(dir, { recursive: true });

  const token = crypto.randomBytes(24).toString('hex');
  const ext = EXT_TO_MIME[extOf(fileName)] ? extOf(fileName) : (mime === 'image/png' ? 'png' : 'jpg');
  const safeName = sanitizeFileName(fileName.replace(/\.[^.]+$/, '')) || 'image';
  const storageName = `${Date.now()}_${token.slice(0, 10)}_${safeName}.${ext}`;
  const storagePath = path.join(dir, storageName);

  await fs.writeFile(storagePath, buffer);

  return {
    storagePath,
    publicToken: token,
    mime,
    fileName: sanitizeFileName(fileName),
    byteLength: buffer.length,
    publicUrl: buildPublicAssetUrl(token),
  };
}

export async function readSocialImage(storagePath) {
  return fs.readFile(storagePath);
}

export async function deleteSocialImage(storagePath) {
  if (!storagePath) return;
  try {
    await fs.unlink(storagePath);
  } catch {
    /* ignore missing */
  }
}
