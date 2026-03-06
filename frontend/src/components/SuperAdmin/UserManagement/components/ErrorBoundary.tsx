import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackTitle?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export default class SectionErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-20 px-6">
          <div className="w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center mb-5">
            <AlertTriangle className="w-8 h-8 text-red-400 dark:text-red-500" />
          </div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1.5">
            {this.props.fallbackTitle || 'Something went wrong'}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-sm mb-6">
            An unexpected error occurred in this section. Please try again.
          </p>
          <button
            onClick={this.handleRetry}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-sm transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <pre className="mt-6 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs text-red-600 dark:text-red-400 max-w-lg overflow-auto max-h-40">
              {this.state.error.message}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
