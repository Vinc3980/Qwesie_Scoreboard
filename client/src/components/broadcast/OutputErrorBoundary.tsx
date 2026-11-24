import React from 'react';

type Props = {
  children: React.ReactNode;
  /** Called once per caught error so the debug chip can explain a blank output. */
  onError?: (message: string) => void;
  /** Change to retry rendering after a new snapshot/scene arrives. */
  resetKey?: string | number;
};

type State = { hasError: boolean };

/**
 * On-air outputs must never show a React error screen.  If a graphic throws we
 * log the error, render nothing (transparent), and let the debug chip report it
 * when `?debug=1` is present.
 */
export class OutputErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[overlay] render error', error, info?.componentStack);
    try { this.props.onError?.(error?.message || String(error)); } catch {}
  }

  componentDidUpdate(prev: Props) {
    if (this.state.hasError && prev.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

export default OutputErrorBoundary;
