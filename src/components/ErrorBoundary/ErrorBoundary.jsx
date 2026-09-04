import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, prevResetKey: props.resetKey };
  }

  static getDerivedStateFromProps(props, state) {
    if (props.resetKey !== state.prevResetKey) {
      return {
        hasError: false,
        error: null,
        prevResetKey: props.resetKey
      };
    }
    return null;
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Unhandled React Error Boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      const errorMessage = String(this.state.error?.message || '');
      const isChunkLoadError =
        this.state.error?.name === 'ChunkLoadError' ||
        /importing a module script failed/i.test(errorMessage) ||
        /failed to fetch dynamically imported module/i.test(errorMessage) ||
        /error loading dynamically imported module/i.test(errorMessage) ||
        /loading chunk [\d\w]+ failed/i.test(errorMessage);

      if (isChunkLoadError) {
        return (
          <div style={{
            padding: '2.5rem 1.5rem',
            margin: '2rem auto',
            maxWidth: '560px',
            background: 'var(--bg-card, #13171f)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '16px',
            color: '#fff',
            textAlign: 'center',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
          }}>
            <h2 style={{ fontSize: '1.35rem', marginBottom: '0.75rem', fontWeight: 600 }}>
              New version available
            </h2>
            <p style={{ color: '#9ca3af', margin: '0 0 1.5rem 0', fontSize: '0.95rem', lineHeight: 1.5 }}>
              OddsYra was updated with new improvements. Please refresh your browser to load the latest version.
            </p>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') window.location.reload();
              }}
              style={{
                padding: '10px 24px',
                background: '#00d26a',
                color: '#000',
                fontWeight: 'bold',
                fontSize: '0.95rem',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'opacity 0.2s',
              }}
            >
              Refresh to Update
            </button>
          </div>
        );
      }

      return (
        <div style={{
          padding: '2rem',
          margin: '2rem auto',
          maxWidth: '600px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '12px',
          color: '#f87171',
          textAlign: 'center',
        }}>
          <h2>Something went wrong loading this section</h2>
          <p style={{ color: '#9ca3af', margin: '1rem 0', wordBreak: 'break-word' }}>
            {errorMessage || 'An unexpected rendering error occurred. Please refresh the page.'}
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '1.25rem' }}>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{
                padding: '8px 16px',
                background: '#00d26a',
                color: '#000',
                fontWeight: 'bold',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              Try Again
            </button>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') window.location.reload();
              }}
              style={{
                padding: '8px 16px',
                background: 'rgba(255, 255, 255, 0.1)',
                color: '#fff',
                fontWeight: '500',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
