import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { AppLogo } from './AppLogo';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  viewName?: string;
  onDismiss?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[400px] items-center justify-center p-8">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#f87171]/20 bg-[#f87171]/[0.08]">
              <AlertTriangle size={24} className="text-[#f87171]" />
            </div>
            <h2 className="text-lg font-semibold text-white">
              {this.props.viewName ? `${this.props.viewName} crashed` : 'Something went wrong'}
            </h2>
            <p className="mt-2 text-sm text-white/45">
              {this.state.error?.message ?? 'An unexpected error occurred.'}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, error: null })}
                className="inline-flex items-center gap-2 rounded-xl border border-white/[0.10] bg-white/[0.06] px-4 py-2.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/[0.10] hover:text-white"
              >
                <RotateCcw size={14} />
                Try again
              </button>
              {this.props.onDismiss && (
                <button
                  type="button"
                  onClick={() => { this.setState({ hasError: false, error: null }); this.props.onDismiss?.(); }}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/[0.10] bg-white/[0.06] px-4 py-2.5 text-sm font-medium text-white/70 transition-colors hover:bg-white/[0.10] hover:text-white"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export function AppCrashScreen({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#06070a] text-white">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04]">
          <AppLogo size={28} />
        </div>
        <h1 className="text-xl font-semibold">Workspace encountered an error</h1>
        <p className="mt-3 text-sm leading-relaxed text-white/45">{error.message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-black px-5 py-2.5 text-sm font-medium transition-colors hover:bg-black dark:hover:bg-white/90"
        >
          <RotateCcw size={14} />
          Reload
        </button>
      </div>
    </div>
  );
}
