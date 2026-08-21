import { useEffect, useState } from 'react';

/**
 * Renders a TOTP otpauth:// URL as a QR image for authenticator apps.
 */
export default function AdminMfaQr({ otpauthUrl, size = 192 }) {
  const [dataUrl, setDataUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!otpauthUrl) {
      setDataUrl('');
      setError('');
      return undefined;
    }
    let cancelled = false;
    setError('');
    import('qrcode')
      .then((QRCode) => QRCode.toDataURL(otpauthUrl, {
        width: size,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark: '#0f172a', light: '#ffffff' },
      }))
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) {
          setDataUrl('');
          setError('Could not render QR code — use the secret below instead.');
        }
      });
    return () => { cancelled = true; };
  }, [otpauthUrl, size]);

  if (error) {
    return <p style={{ margin: 0, fontSize: '0.72rem', color: '#f87171' }}>{error}</p>;
  }
  if (!dataUrl) {
    return (
      <div
        style={{
          width: size,
          height: size,
          margin: '0 auto',
          borderRadius: 8,
          background: 'var(--admin-bg, #f1f5f9)',
          display: 'grid',
          placeItems: 'center',
          fontSize: '0.75rem',
          color: 'var(--admin-text-muted)',
        }}
      >
        Preparing QR…
      </div>
    );
  }

  return (
    <img
      src={dataUrl}
      alt="Scan this QR code with Google Authenticator or 1Password"
      width={size}
      height={size}
      style={{
        display: 'block',
        margin: '0 auto',
        borderRadius: 8,
        border: '1px solid var(--admin-border, #e2e8f0)',
        background: '#fff',
      }}
    />
  );
}
