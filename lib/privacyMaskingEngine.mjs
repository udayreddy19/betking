/**
 * Enterprise Data Privacy & PII Masking Engine
 */

export function maskEmail(email) {
  if (!email || !email.includes('@')) return email || '';
  const [name, domain] = email.split('@');
  if (name.length <= 2) return `${name[0]}***@${domain}`;
  return `${name[0]}***${name[name.length - 1]}@${domain}`;
}

export function maskPhone(phone) {
  if (!phone || phone.length < 4) return phone || '';
  return `******${phone.slice(-4)}`;
}

export function maskUserProfile(userProfile, viewerRole = 'OPERATOR') {
  if (viewerRole === 'SUPER_ADMIN') return userProfile;

  return {
    ...userProfile,
    email: maskEmail(userProfile.email),
    phone: maskPhone(userProfile.phone),
  };
}
