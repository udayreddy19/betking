import React from 'react';

export default function ApiTestButton({
  label = 'Fetch Data',
  testing = false,
  disabled = false,
  onClick,
  variant = 'primary',
}) {
  return (
    <button
      type="button"
      className={`admin-btn admin-btn--${variant}${testing ? ' api-explorer__btn--busy' : ''}`}
      disabled={disabled || testing}
      onClick={onClick}
    >
      {testing ? 'Testing…' : label}
    </button>
  );
}
