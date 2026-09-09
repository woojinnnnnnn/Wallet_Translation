import { Component, type ErrorInfo, type ReactNode } from 'react';

// The app renders live, adversarial third-party data (Blockscout/GoPlus/
// CoinGecko responses, and whatever a scam token's attacker-controlled
// symbol/decoded_input happens to contain) with no server in front of it to
// sanitize edge cases first. Without this, an unhandled render error — a
// malformed field from an API response neither this code nor its author
// anticipated — takes the entire page to a blank white screen with no way
// back except knowing to hit reload, which is a bad first impression for
// exactly the kind of unusual address someone tries against a public demo.
export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled error while rendering the app:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-crash-fallback" role="alert">
          <p>Something went wrong displaying this page.</p>
          <p>
            This is usually caused by an unexpected response from one of the
            chain APIs — reloading, or trying a different address or chain,
            often clears it.
          </p>
          <button type="button" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
