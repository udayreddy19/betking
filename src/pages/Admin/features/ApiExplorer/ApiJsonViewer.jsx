import React, { useMemo } from 'react';

export default function ApiJsonViewer({ value }) {
  const text = useMemo(() => {
    try {
      return JSON.stringify(value ?? null, null, 2);
    } catch {
      return String(value);
    }
  }, [value]);

  return (
    <pre className="api-explorer__json" tabIndex={0}>
      {text}
    </pre>
  );
}
