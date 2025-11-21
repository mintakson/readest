import React, { Component, ReactNode, ErrorInfo } from 'react';
import { captureException } from '@/utils/analytics';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetKeys?: Array<string | number>;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  private resetKeys: Array<string | number> = [];

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
    this.resetKeys = props.resetKeys || [];
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught error:', error, errorInfo);

    // Capture error with analytics
    if (typeof window !== 'undefined') {
      captureException(error, { extra: { errorInfo } });
    }

    this.setState({ errorInfo });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  componentDidUpdate(prevProps: Props): void {
    const { resetKeys } = this.props;
    const { hasError } = this.state;

    if (
      hasError &&
      resetKeys &&
      resetKeys.length > 0 &&
      JSON.stringify(prevProps.resetKeys) !== JSON.stringify(resetKeys)
    ) {
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
      });
    }
  }

  resetErrorBoundary = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    const { hasError, error } = this.state;
    const { children, fallback } = this.props;

    if (hasError) {
      if (fallback) {
        return fallback;
      }

      return (
        <div className='flex h-full w-full flex-col items-center justify-center p-8 text-center'>
          <div className='max-w-md rounded-lg bg-base-200 p-6 shadow-lg'>
            <h2 className='mb-4 text-xl font-bold text-error'>Something went wrong</h2>
            <p className='mb-4 text-sm text-base-content/70'>
              {error?.message || 'An unexpected error occurred'}
            </p>
            <button className='btn btn-primary btn-sm' onClick={this.resetErrorBoundary}>
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return children;
  }
}

export default ErrorBoundary;
