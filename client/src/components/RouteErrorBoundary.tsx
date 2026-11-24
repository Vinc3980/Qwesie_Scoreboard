import React from 'react';

type Props = {
  children: React.ReactNode;
  resetKey?: string;
};

type State = {
  hasError: boolean;
  error?: Error;
};

function isChunkLoadError(error: unknown) {
  const msg = String((error as any)?.message || error || '').toLowerCase();
  return (
    msg.includes('failed to fetch dynamically imported module') ||
    msg.includes('importing a module script failed') ||
    msg.includes('loading chunk') ||
    msg.includes('chunkloaderror') ||
    msg.includes('css chunk load failed')
  );
}

export class RouteErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('Route render/load error', error, info);
    if (isChunkLoadError(error)) {
      try {
        const key = 'qwesie.chunkReloaded';
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, '1');
          window.location.reload();
          return;
        }
      } catch {
        // ignore storage errors
      }
    }
  }

  componentDidUpdate(prevProps: Props) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: undefined });
    }
    if (!this.state.hasError) {
      try {
        // Clear once the app is healthy so future legitimate chunk updates can recover once.
        sessionStorage.removeItem('qwesie.chunkReloaded');
      } catch {}
    }
  }

  private retry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  private reload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    const chunkError = isChunkLoadError(this.state.error);
    return (
      <div className="min-h-[50vh] flex items-center justify-center p-6 bg-background text-fg">
        <div className="w-full max-w-xl rounded-[14px] border border-border bg-surface-raised p-5 space-y-3">
          <div className="text-lg font-bold font-display tracking-wide text-fg">
            {chunkError ? 'Page failed to load' : 'Something went wrong'}
          </div>
          <div className="text-sm text-fg-muted">
            {chunkError
              ? 'The app bundle for this page could not be loaded (often after a restart/update or a temporary network issue). Reload to fetch the latest version.'
              : 'This page hit an error while rendering. You can try again, or reload if the problem persists.'}
          </div>
          {this.state.error?.message ? (
            <pre className="text-xs whitespace-pre-wrap break-words rounded-[10px] border border-border bg-surface-sunken p-3 text-fg">
              {this.state.error.message}
            </pre>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={this.retry}
              className="inline-flex items-center justify-center rounded-[10px] px-3 py-2 text-sm font-semibold border border-border bg-surface hover:bg-surface-alt text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={this.reload}
              className="inline-flex items-center justify-center rounded-[10px] px-3 py-2 text-sm font-semibold bg-accent text-accent-fg hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
