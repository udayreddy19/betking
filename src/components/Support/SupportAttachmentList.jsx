import React, { useEffect, useState } from 'react';
import {
  attachmentDisplayName,
  attachmentUrl,
  fetchAttachmentObjectUrl,
  formatAttachmentSize,
  isPreviewableAttachment,
} from '../../utils/supportAttachments';

export default function SupportAttachmentList({ attachments = [], admin = false }) {
  const list = Array.isArray(attachments) ? attachments.filter(Boolean) : [];
  if (!list.length) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
      {list.map((att) => (
        <SupportAttachmentItem
          key={att.attachmentId || att.attachment_id || att.url || attachmentDisplayName(att)}
          att={att}
          admin={admin}
        />
      ))}
    </div>
  );
}

function SupportAttachmentItem({ att, admin }) {
  const [objectUrl, setObjectUrl] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const name = attachmentDisplayName(att);
  const url = attachmentUrl(att, { admin });
  const previewable = isPreviewableAttachment(att);
  const sizeLabel = att.fileSize || att.file_size
    ? formatAttachmentSize(att.fileSize || att.file_size)
    : '';

  useEffect(() => {
    let revoked = false;
    let created = null;
    if (!previewable || !url) return undefined;
    (async () => {
      try {
        created = await fetchAttachmentObjectUrl(url, { adminFetch: admin });
        if (!revoked) setObjectUrl(created);
        else if (created) URL.revokeObjectURL(created);
      } catch {
        if (!revoked) setLoadError(true);
      }
    })();
    return () => {
      revoked = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [url, previewable, admin]);

  const openDownload = async () => {
    try {
      const blobUrl = objectUrl || await fetchAttachmentObjectUrl(url, { adminFetch: admin });
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = name;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (!objectUrl && blobUrl) URL.revokeObjectURL(blobUrl);
    } catch {
      setLoadError(true);
    }
  };

  return (
    <div
      style={{
        border: '1px solid rgba(148,163,184,0.35)',
        borderRadius: 8,
        padding: 8,
        background: 'rgba(15,23,42,0.35)',
        maxWidth: 280,
      }}
    >
      {previewable && objectUrl && !loadError ? (
        <button
          type="button"
          onClick={openDownload}
          style={{ display: 'block', padding: 0, border: 'none', background: 'none', cursor: 'pointer', width: '100%' }}
          title={`Open ${name}`}
        >
          <img
            src={objectUrl}
            alt={name}
            style={{
              display: 'block',
              maxWidth: '100%',
              maxHeight: 180,
              borderRadius: 6,
              objectFit: 'contain',
            }}
          />
        </button>
      ) : null}
      <button
        type="button"
        onClick={openDownload}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginTop: previewable && objectUrl ? 6 : 0,
          padding: 0,
          border: 'none',
          background: 'none',
          color: '#60a5fa',
          cursor: 'pointer',
          fontSize: '0.8rem',
          textAlign: 'left',
        }}
      >
        <span aria-hidden>📎</span>
        <span style={{ wordBreak: 'break-word' }}>
          {name}
          {sizeLabel ? ` (${sizeLabel})` : ''}
        </span>
      </button>
      {loadError && (
        <div style={{ color: '#f87171', fontSize: '0.72rem', marginTop: 4 }}>Could not load file</div>
      )}
    </div>
  );
}
