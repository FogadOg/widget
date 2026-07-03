'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
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
        <div className="m-4 rounded-lg bg-destructive/10 p-6 font-sans">
          <h3 className="mt-0 mb-3 text-lg font-semibold text-destructive">
            Something went wrong
          </h3>
          <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
            The widget encountered an error. Please try refreshing the page.
          </p>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details className="mb-4 rounded bg-muted p-3 font-mono text-xs">
              <summary className="mb-2 cursor-pointer font-semibold">
                Error details
              </summary>
              <pre className="m-0 whitespace-pre-wrap break-words">
                {this.state.error.toString()}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}
          <Button size="sm" onClick={this.handleReset}>
            Try Again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
