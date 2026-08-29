import React from 'react';
import AdminBadge from '../../components/AdminBadge';

const VARIANT = {
  HEALTHY: 'success',
  SLOW: 'warning',
  FAILED: 'danger',
  NOT_CONFIGURED: 'neutral',
  TESTING: 'info',
  UNKNOWN: 'neutral',
};

const LABEL = {
  HEALTHY: 'Healthy',
  SLOW: 'Slow',
  FAILED: 'Failed',
  NOT_CONFIGURED: 'Not Configured',
  TESTING: 'Testing',
  UNKNOWN: 'Unknown',
};

export default function ApiStatusBadge({ status }) {
  const key = String(status || 'UNKNOWN').toUpperCase();
  return (
    <AdminBadge variant={VARIANT[key] || 'neutral'}>
      {LABEL[key] || status || '—'}
    </AdminBadge>
  );
}
