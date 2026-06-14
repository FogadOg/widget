'use client';

import React from 'react';
import { logError } from '../lib/logger';
import { reportError } from '../lib/monitoring';

type ErrorBoundaryProps = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
};

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error using production-safe logger
    logError('Widget Error Boundary caught an error', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });

    // Forward to monitoring backend / Sentry if configured
    reportError(error, {
      componentStack: errorInfo.componentStack ?? undefined,
    });

    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Production: silently disappear. The widget lives on a customer's site,
      // so a crash must never paint a red error card over their page — the
      // error was already reported to monitoring in componentDidCatch.
      if (process.env.NODE_ENV === 'production') {
        return null;
      }

      // Development: show full error details
      return (
        <div style={{
          padding: '24px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          backgroundColor: '#fef2f2',
          borderRadius: '8px',
          margin: '16px',
        }}>
          <h3 style={{
            color: '#dc2626',
            marginTop: 0,
            fontSize: '18px',
            fontWeight: '600',
            marginBottom: '12px'
          }}>
            Something went wrong
          </h3>
          <p style={{
            color: '#6b7280',
            fontSize: '14px',
            lineHeight: '1.6',
            marginBottom: '16px'
          }}>
            The widget encountered an error. Please try refreshing the page.
          </p>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details style={{
              backgroundColor: '#f3f4f6',
              padding: '12px',
              borderRadius: '4px',
              fontSize: '12px',
              fontFamily: 'monospace',
              marginBottom: '16px'
            }}>
              <summary style={{ cursor: 'pointer', fontWeight: '600', marginBottom: '8px' }}>
                Error details
              </summary>
              <pre style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                margin: 0
              }}>
                {this.state.error.toString()}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}
          <button
            onClick={this.handleReset}
            style={{
              backgroundColor: '#2563eb',
              color: 'white',
              padding: '8px 16px',
              borderRadius: '6px',
              border: 'none',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
