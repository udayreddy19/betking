import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApiClient } from '../api/adminApiClient';
import AdminDataTable from '../components/AdminDataTable';
import { useAdminToast } from '../components/AdminToastContext';
import { StatusBadge } from '../components/AdminBadge';
import AdminConfirmDialog from '../components/AdminConfirmDialog';

const MAX_CAPTION = 2200;
const ACCEPT = 'image/jpeg,image/png,.jpg,.jpeg,.png';

function fileToBase64Payload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.readAsDataURL(file);
  });
}

function formatWhen(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

export default function SocialMediaPanel() {
  const { showToast } = useAdminToast();
  const [status, setStatus] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [caption, setCaption] = useState('');
  const [mediaType, setMediaType] = useState('FEED');
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [confirmDraft, setConfirmDraft] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const data = await adminApiClient.get('/social/status');
      setStatus(data);
    } catch (err) {
      setStatus({ configured: false, error: err.message });
    }
  }, []);

  const loadPosts = useCallback(async () => {
    setLoadingPosts(true);
    try {
      const data = await adminApiClient.get('/social/posts?limit=50');
      setPosts(data.posts || []);
    } catch (err) {
      showToast(err.message || 'Failed to load posts', 'error');
      setPosts([]);
    } finally {
      setLoadingPosts(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadStatus();
    loadPosts();
  }, [loadStatus, loadPosts]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const captionLeft = MAX_CAPTION - caption.length;
  const canSubmit = Boolean(file) && (mediaType === 'STORY' || caption.trim().length > 0);

  const onPickFile = (e) => {
    const next = e.target.files?.[0] || null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (!next) {
      setFile(null);
      setPreviewUrl('');
      return;
    }
    const type = String(next.type || '').toLowerCase();
    if (!type.includes('jpeg') && !type.includes('jpg') && !type.includes('png')) {
      showToast('Use a JPEG or PNG image', 'error');
      e.target.value = '';
      return;
    }
    if (next.size > 8 * 1024 * 1024) {
      showToast('Image must be 8MB or smaller', 'error');
      e.target.value = '';
      return;
    }
    setFile(next);
    setPreviewUrl(URL.createObjectURL(next));
  };

  const clearCompose = () => {
    setCaption('');
    setMediaType('FEED');
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
  };

  const submitPost = async (publishNow) => {
    if (!file) {
      showToast('Add an image first', 'error');
      return;
    }
    if (mediaType === 'FEED' && !caption.trim()) {
      showToast('Caption is required for feed posts', 'error');
      return;
    }
    setPublishing(true);
    try {
      const base64Data = await fileToBase64Payload(file);
      const res = await adminApiClient.post('/social/posts', {
        caption: caption.trim(),
        mediaType,
        publishNow,
        image: {
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          base64Data,
        },
      });
      setConfirmPublish(false);
      setConfirmDraft(false);
      clearCompose();
      showToast(
        publishNow
          ? `Published to Instagram${res.externalPostId ? ` (${res.externalPostId})` : ''}`
          : 'Saved as draft',
        'success',
      );
      await loadPosts();
    } catch (err) {
      const msg = err.message || 'Publish failed';
      showToast(msg, 'error');
      if (err.data?.post) {
        await loadPosts();
      }
    } finally {
      setPublishing(false);
    }
  };

  const retryPublish = async (postId) => {
    try {
      await adminApiClient.post(`/social/posts/${encodeURIComponent(postId)}/publish`);
      showToast('Published to Instagram', 'success');
      await loadPosts();
    } catch (err) {
      showToast(err.message || 'Retry failed', 'error');
      await loadPosts();
    }
  };

  const deletePost = async (postId) => {
    try {
      await adminApiClient.delete(`/social/posts/${encodeURIComponent(postId)}`);
      showToast('Draft removed', 'success');
      await loadPosts();
    } catch (err) {
      showToast(err.message || 'Delete failed', 'error');
    }
  };

  const setupSteps = status?.setup?.steps || [];

  const rows = useMemo(() => posts.map((p) => ({
    id: p.id,
    mediaType: p.mediaType,
    caption: (p.caption || '').slice(0, 80) + ((p.caption || '').length > 80 ? '…' : ''),
    status: p.status,
    error: p.errorMessage || '—',
    publishedAt: formatWhen(p.publishedAt),
    createdAt: formatWhen(p.createdAt),
    _raw: p,
  })), [posts]);

  return (
    <div className="admin-social-media">
      <div style={{ marginBottom: 16 }}>
        <h2 className="admin-page-header__title">Instagram</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--admin-text-muted)', fontSize: '0.82rem' }}>
          Add a caption and image — publish posts straight to @oddsyra via Meta Graph API.
        </p>
      </div>

      {status && !status.configured && (
        <div className="admin-social-media__banner" role="status">
          <strong>Instagram API not connected yet.</strong>
          <p style={{ margin: '6px 0 0', fontSize: '0.8rem' }}>
            You can still save drafts here. To auto-post, add{' '}
            <code>INSTAGRAM_BUSINESS_ACCOUNT_ID</code> and{' '}
            <code>INSTAGRAM_ACCESS_TOKEN</code> on the server, then restart.
          </p>
          {setupSteps.length > 0 && (
            <ol style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: '0.78rem' }}>
              {setupSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          )}
          {status.setup?.docsUrl && (
            <p style={{ margin: '8px 0 0', fontSize: '0.78rem' }}>
              <a href={status.setup.docsUrl} target="_blank" rel="noreferrer">
                Meta content publishing docs
              </a>
            </p>
          )}
        </div>
      )}

      {status?.configured && (
        <p className="admin-social-media__ready" style={{ marginBottom: 14, fontSize: '0.8rem', color: 'var(--admin-text-muted)' }}>
          Connected · Graph {status.graphVersion} · JPEG/PNG up to {Math.round((status.maxImageBytes || 0) / (1024 * 1024))}MB
        </p>
      )}

      <form
        className="admin-compose-mail__form admin-social-media__form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSubmit) {
            showToast(mediaType === 'FEED' ? 'Image and caption are required' : 'Image is required', 'error');
            return;
          }
          setConfirmPublish(true);
        }}
      >
        <fieldset className="admin-compose-mail__from">
          <legend>Post type</legend>
          <div className="admin-compose-mail__mailboxes">
            {[
              { id: 'FEED', label: 'Feed post', desc: 'Image + caption on the grid' },
              { id: 'STORY', label: 'Story', desc: '24h story (image only)' },
            ].map((opt) => (
              <label
                key={opt.id}
                className={`admin-compose-mail__mailbox${mediaType === opt.id ? ' is-active' : ''}`}
              >
                <input
                  type="radio"
                  name="mediaType"
                  value={opt.id}
                  checked={mediaType === opt.id}
                  onChange={() => setMediaType(opt.id)}
                />
                <span>
                  <span className="admin-compose-mail__mailbox-email">{opt.label}</span>
                  <span className="admin-compose-mail__mailbox-desc">{opt.desc}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="admin-compose-mail__label" htmlFor="social-caption">
          Caption {mediaType === 'STORY' ? '(optional for stories)' : ''}
        </label>
        <textarea
          id="social-caption"
          className="admin-compose-mail__textarea"
          rows={6}
          value={caption}
          onChange={(e) => setCaption(e.target.value.slice(0, MAX_CAPTION))}
          placeholder={'Live cricket. Real-time odds. UPI in seconds.\nOddsYra is live — link in bio.\n18+ only. Play responsibly.\n#OddsYra #LiveCricket'}
        />
        <div className="admin-compose-mail__hint">{captionLeft} characters left</div>

        <label className="admin-compose-mail__label" htmlFor="social-image">
          Image (JPEG or PNG)
        </label>
        <input
          id="social-image"
          type="file"
          accept={ACCEPT}
          onChange={onPickFile}
        />
        {previewUrl && (
          <div className="admin-social-media__preview">
            <img src={previewUrl} alt="Post preview" />
          </div>
        )}

        <div className="admin-compose-mail__actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <button
            type="submit"
            className="admin-btn admin-btn--primary"
            disabled={!canSubmit || publishing}
          >
            {publishing ? 'Publishing…' : 'Publish to Instagram'}
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--secondary"
            disabled={!canSubmit || publishing}
            onClick={() => setConfirmDraft(true)}
          >
            Save draft
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--ghost"
            disabled={publishing}
            onClick={clearCompose}
          >
            Clear
          </button>
        </div>
      </form>

      <div style={{ marginTop: 28, marginBottom: 10 }}>
        <h3 className="admin-page-header__title" style={{ fontSize: '1rem' }}>Recent posts</h3>
      </div>
      <AdminDataTable
        title={loadingPosts ? 'Loading…' : `${rows.length} posts`}
        columns={[
          { header: 'Type', key: 'mediaType', width: 80 },
          { header: 'Caption', key: 'caption' },
          {
            header: 'Status',
            key: 'status',
            width: 110,
            render: (row) => <StatusBadge status={row.status} />,
          },
          { header: 'Error', key: 'error', width: 180, hideOnMobile: true },
          { header: 'Published', key: 'publishedAt', width: 140, hideOnMobile: true },
          { header: 'Created', key: 'createdAt', width: 140 },
          {
            header: '',
            key: 'actions',
            sortable: false,
            width: 160,
            render: (row) => {
              const p = row._raw;
              return (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(p.status === 'DRAFT' || p.status === 'FAILED') && (
                    <button
                      type="button"
                      className="admin-btn admin-btn--sm admin-btn--primary"
                      onClick={() => retryPublish(p.id)}
                    >
                      Publish
                    </button>
                  )}
                  {p.status !== 'PUBLISHED' && (
                    <button
                      type="button"
                      className="admin-btn admin-btn--sm admin-btn--ghost"
                      onClick={() => deletePost(p.id)}
                    >
                      Delete
                    </button>
                  )}
                  {p.imageUrl && (
                    <a
                      className="admin-btn admin-btn--sm admin-btn--ghost"
                      href={p.imageUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Image
                    </a>
                  )}
                </div>
              );
            },
          },
        ]}
        data={rows}
        emptyMessage="No social posts yet — compose one above."
      />

      <AdminConfirmDialog
        isOpen={confirmPublish}
        variant="warning"
        title="Publish to Instagram?"
        description={
          status?.configured
            ? 'This will post immediately to the connected Instagram professional account.'
            : 'Instagram tokens are not configured — publish will fail until you add them on the server.'
        }
        details={[
          { label: 'Type', value: mediaType === 'STORY' ? 'Story' : 'Feed' },
          { label: 'Caption', value: caption.trim().slice(0, 120) || '(none)' },
          { label: 'Image', value: file?.name || '—' },
        ]}
        confirmLabel="Publish now"
        cancelLabel="Cancel"
        loading={publishing}
        onCancel={() => setConfirmPublish(false)}
        onConfirm={() => submitPost(true)}
      />

      <AdminConfirmDialog
        isOpen={confirmDraft}
        variant="success"
        title="Save as draft?"
        description="Stored in admin only — nothing is sent to Instagram until you publish."
        details={[
          { label: 'Type', value: mediaType === 'STORY' ? 'Story' : 'Feed' },
          { label: 'Image', value: file?.name || '—' },
        ]}
        confirmLabel="Save draft"
        cancelLabel="Cancel"
        loading={publishing}
        onCancel={() => setConfirmDraft(false)}
        onConfirm={() => submitPost(false)}
      />
    </div>
  );
}
