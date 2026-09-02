import { apiFetch } from './apiClient';

export const SUPPORT_ATTACHMENT_ACCEPT =
  '.jpg,.jpeg,.png,.gif,.webp,.heic,.heif,.bmp,.tif,.tiff,.avif,.doc,.docx,.xls,.xlsx,.pdf,.txt,image/*';

export const MAX_SUPPORT_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export function formatAttachmentSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function isPreviewableAttachment(att) {
  const mime = String(att?.fileType || att?.file_type || att?.mime || '').toLowerCase();
  if (mime.startsWith('image/') && !mime.includes('heic') && !mime.includes('heif') && !mime.includes('svg')) {
    return true;
  }
  const name = String(att?.fileName || att?.file_name || '').toLowerCase();
  return /\.(jpe?g|png|gif|webp|bmp|avif)$/i.test(name);
}

export function attachmentDisplayName(att) {
  return att?.fileName || att?.file_name || att?.name || 'Attachment';
}

export function attachmentUrl(att, { admin = false } = {}) {
  const id = att?.attachmentId || att?.attachment_id;
  if (id) {
    return admin
      ? `/api/admin/support/attachments/${id}`
      : `/api/v1/support/attachments/${id}`;
  }
  return att?.url || '';
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export function validateSupportFile(file) {
  if (!file) return 'No file selected.';
  if (file.size > MAX_SUPPORT_ATTACHMENT_BYTES) {
    return 'File size must be under 10MB.';
  }
  const name = String(file.name || '').toLowerCase();
  const type = String(file.type || '').toLowerCase();
  const okExt = /\.(jpe?g|png|gif|webp|heic|heif|bmp|tif|tiff|avif|doc|docx|xls|xlsx|pdf|txt)$/i.test(name);
  const okMime = type.startsWith('image/')
    || [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/pdf',
      'text/plain',
    ].includes(type);
  if (!okExt && !okMime) {
    return 'Unsupported file type. Use images, DOC/DOCX, XLS/XLSX, PDF, or TXT.';
  }
  return null;
}

/**
 * Upload one File via JSON+base64. Returns attachment metadata for message payloads.
 */
export async function uploadSupportAttachment(file, {
  conversationId = null,
  admin = false,
  adminPost = null,
} = {}) {
  const err = validateSupportFile(file);
  if (err) throw new Error(err);
  const base64Data = await fileToBase64(file);
  const body = {
    fileName: file.name,
    fileType: file.type || undefined,
    fileSize: file.size,
    conversationId: conversationId || undefined,
    base64Data,
  };

  if (admin) {
    if (!adminPost) throw new Error('adminPost required for admin uploads');
    const data = await adminPost('/support/attachments/upload', body);
    if (!data?.success || !data?.attachment) {
      throw new Error(data?.error || 'Upload failed');
    }
    return data.attachment;
  }

  const res = await apiFetch('/api/v1/support/attachments/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.attachment) {
    throw new Error(data.error || 'Upload failed');
  }
  return data.attachment;
}

/**
 * Fetch attachment bytes with auth and return an object URL (caller must revoke).
 */
export async function fetchAttachmentObjectUrl(url, { adminFetch = false } = {}) {
  if (!url) return null;

  if (adminFetch) {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('adminToken') : null;
    const headers = new Headers();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const res = await fetch(url, { credentials: 'include', headers });
    if (!res.ok) throw new Error('Failed to load attachment');
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  }

  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load attachment');
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
