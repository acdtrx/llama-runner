import { Component } from 'react';
import type { ReactNode } from 'react';

interface Props {
  label: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  handleReset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="m-4 rounded border border-red-400 bg-red-50 p-4 text-sm text-red-900 dark:bg-red-950 dark:text-red-200">
          <div className="font-medium">{this.props.label} crashed.</div>
          <div className="mt-1 font-mono text-xs opacity-80">{this.state.error.message}</div>
          <button
            type="button"
            onClick={this.handleReset}
            className="mt-2 rounded bg-red-600 px-2 py-1 text-xs text-white"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
