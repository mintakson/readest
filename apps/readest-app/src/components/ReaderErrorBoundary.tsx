/**
 * Error boundary for reader components
 * Provides graceful error handling and recovery for book loading/rendering
 */

import React, { Component, ReactNode } from 'react';
import { crashTracker } from '@/services/crashTracker';
import { performanceMonitor } from '@/utils/performance';

interface Props {
  children: ReactNode;
  bookKey?: string;
  fallback?: (error: Error, retry: () => void) => ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  retryCount: number;
}

export class ReaderErrorBoundary extends Component<Props, State> {
  private maxRetries = 3;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('Reader Error Boundary caught an error:', error, errorInfo);

    // Track crash
    crashTracker.reportCrash({
      type: 'crash',
      message: error.message,
      stack: error.stack,
      metadata: {
        componentStack: errorInfo.componentStack,
        bookKey: this.props.bookKey,
        retryCount: this.state.retryCount,
      },
    });

    // Log to performance monitor
    performanceMonitor.logError(error);

    this.setState({
      errorInfo,
    });
  }

  handleRetry = (): void => {
    const { retryCount } = this.state;

    if (retryCount >= this.maxRetries) {
      console.error('Max retry attempts reached');
      return;
    }

    console.log(`Retrying (${retryCount + 1}/${this.maxRetries})...`);

    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: retryCount + 1,
    });
  };

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
    });
  };

  render(): ReactNode {
    const { hasError, error, errorInfo, retryCount } = this.state;
    const { children, fallback } = this.props;

    if (hasError && error) {
      if (fallback) {
        return fallback(error, this.handleRetry);
      }

      return (
        <div className='flex h-full w-full items-center justify-center p-4'>
          <div className='max-w-md rounded-lg border border-error/20 bg-base-100 p-6 shadow-lg'>
            <div className='mb-4 flex items-center gap-3'>
              <svg
                className='h-8 w-8 text-error'
                fill='none'
                viewBox='0 0 24 24'
                stroke='currentColor'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'
                />
              </svg>
              <h2 className='text-xl font-semibold text-error'>Failed to load book</h2>
            </div>

            <div className='mb-4 rounded bg-base-200 p-3'>
              <p className='mb-2 font-mono text-sm text-error'>{error.message}</p>
              {errorInfo && (
                <details className='mt-2'>
                  <summary className='cursor-pointer text-sm text-base-content/60'>
                    Show error details
                  </summary>
                  <pre className='mt-2 max-h-40 overflow-auto text-xs text-base-content/60'>
                    {errorInfo.componentStack}
                  </pre>
                </details>
              )}
            </div>

            <div className='flex flex-col gap-2'>
              {retryCount < this.maxRetries && (
                <button onClick={this.handleRetry} className='btn btn-primary btn-sm'>
                  Try Again ({this.maxRetries - retryCount} attempts remaining)
                </button>
              )}

              <button
                onClick={() => window.history.back()}
                className='btn btn-ghost btn-sm'
              >
                Go Back
              </button>

              <button
                onClick={() => window.location.reload()}
                className='btn btn-ghost btn-sm'
              >
                Reload Page
              </button>
            </div>

            <div className='mt-4 rounded-lg bg-base-200 p-3'>
              <p className='text-xs text-base-content/60'>
                <strong>Troubleshooting tips:</strong>
              </p>
              <ul className='mt-2 list-inside list-disc space-y-1 text-xs text-base-content/60'>
                <li>The book file may be corrupted or in an unsupported format</li>
                <li>Try re-importing the book</li>
                <li>Check if you have enough device storage</li>
                <li>Restart the application if the problem persists</li>
              </ul>
            </div>
          </div>
        </div>
      );
    }

    return children;
  }
}

export default ReaderErrorBoundary;
