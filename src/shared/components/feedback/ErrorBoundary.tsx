import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Error Boundary Component
 * Catches JavaScript errors anywhere in the child component tree and displays a fallback UI.
 * Stack traces are only shown in development mode for security.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Log error for debugging
    console.error('ErrorBoundary caught an error:', error, info);
    
    // TODO: Send to error tracking service (e.g., Sentry)
    // if (import.meta.env.PROD) {
    //   Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
    // }
  }

  handleRefresh = (): void => {
    window.location.reload();
  };

  handleGoHome = (): void => {
    window.location.href = '/';
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isDevelopment = import.meta.env.DEV;

      return (
        <div className="error-boundary" style={styles.container}>
          <div className="error-boundary__content" style={styles.content}>
            <div style={styles.iconWrapper}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            
            <h1 className="error-boundary__title" style={styles.title}>
              Something went wrong
            </h1>
            
            <p className="error-boundary__message" style={styles.message}>
              CineTrack encountered an unexpected error. Don't worry, your data is safe.
            </p>

            {/* Only show error details in development */}
            {isDevelopment && this.state.error && (
              <div className="error-boundary__details" style={styles.details}>
                <p style={styles.devWarning}>⚠️ Development Mode - Error Details:</p>
                <code className="error-boundary__error-text" style={styles.errorText}>
                  {this.state.error.toString()}
                </code>
                {this.state.error.stack && (
                  <pre className="error-boundary__stack" style={styles.stack}>
                    {this.state.error.stack}
                  </pre>
                )}
              </div>
            )}

            {/* Production: Show generic error ID for support */}
            {!isDevelopment && (
              <p style={styles.errorId}>
                Error ID: {Date.now().toString(36).toUpperCase()}
              </p>
            )}

            <div style={styles.buttonGroup}>
              <button
                onClick={this.handleRefresh}
                className="error-boundary__button"
                style={styles.primaryButton}
              >
                Refresh Page
              </button>
              <button
                onClick={this.handleGoHome}
                className="error-boundary__button-secondary"
                style={styles.secondaryButton}
              >
                Go to Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0a0a',
    padding: '20px',
  },
  content: {
    maxWidth: '500px',
    textAlign: 'center',
    padding: '40px',
    backgroundColor: 'rgba(20, 20, 20, 0.8)',
    borderRadius: '16px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  },
  iconWrapper: {
    marginBottom: '24px',
  },
  title: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#ffffff',
    marginBottom: '12px',
  },
  message: {
    fontSize: '16px',
    color: '#9ca3af',
    marginBottom: '24px',
    lineHeight: 1.5,
  },
  details: {
    textAlign: 'left',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '24px',
  },
  devWarning: {
    fontSize: '12px',
    color: '#fbbf24',
    marginBottom: '8px',
  },
  errorText: {
    display: 'block',
    fontSize: '13px',
    color: '#f87171',
    wordBreak: 'break-word',
  },
  stack: {
    fontSize: '11px',
    color: '#9ca3af',
    marginTop: '12px',
    padding: '12px',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '4px',
    overflow: 'auto',
    maxHeight: '200px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  errorId: {
    fontSize: '12px',
    color: '#6b7280',
    marginBottom: '24px',
  },
  buttonGroup: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
  },
  primaryButton: {
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#ffffff',
    backgroundColor: '#14b8a6',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  secondaryButton: {
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#9ca3af',
    backgroundColor: 'transparent',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
};

export default ErrorBoundary;
