import crypto from 'crypto';
import { getJwtSecret } from './jwtSecret.mjs';

function key() {
  const material = process.env.TOTP_ENCRYPTION_KEY || `${getJwtSecret()}:admin-mfa-v1`;
  return crypto.createHash('sha256').update(material).digest();
}

export function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

export function decryptSecret({ ciphertext, iv, tag }) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key(),
    Buffer.from(iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]);
  return plain.toString('utf8');
}
