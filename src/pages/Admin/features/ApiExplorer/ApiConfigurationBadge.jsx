import React from 'react';
import AdminBadge from '../../components/AdminBadge';

export default function ApiConfigurationBadge({ configuration }) {
  const status = String(configuration?.status || 'MISSING').toUpperCase();
  const mode = configuration?.mode;
  if (status === 'TEST_MODE' || mode === 'TEST') {
    return <AdminBadge variant="warning">⚠ Test Mode</AdminBadge>;
  }
  if (status === 'DEVELOPMENT' || mode === 'DEVELOPMENT') {
    return <AdminBadge variant="warning">⚠ Development</AdminBadge>;
  }
  if (status === 'CONFIGURED') {
    return <AdminBadge variant="success">✓ Configured</AdminBadge>;
  }
  return <AdminBadge variant="neutral">✗ Missing</AdminBadge>;
}
