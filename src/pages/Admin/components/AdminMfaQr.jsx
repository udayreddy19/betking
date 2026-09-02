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
        color: { dark: '#121212', light: '#ffffff' },
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
    return <p className="admin-login__qr-error">{error}</p>;
  }
  if (!dataUrl) {
    return (
      <div className="admin-login__qr-placeholder" style={{ width: size, height: size }}>
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
      className="admin-login__qr-img"
    />
  );
}
