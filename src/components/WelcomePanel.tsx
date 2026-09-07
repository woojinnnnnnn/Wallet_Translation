import type { ReactNode } from 'react';

export function WelcomePanel({
  children,
  hasInjectedConnector,
  isConnecting,
  onConnect,
}: {
  children: ReactNode;
  hasInjectedConnector: boolean;
  isConnecting: boolean;
  onConnect: () => void;
}) {
  return (
    <section className="welcome-panel" aria-labelledby="welcome-title">
      <div className="welcome-copy">
        <p className="welcome-eyebrow">Read-only wallet activity</p>
        <h2 id="welcome-title">See what moved in your wallet.</h2>
        <p>
          Clear, readable activity for any public address.
        </p>
        <button
          className="welcome-connect-button"
          disabled={isConnecting || !hasInjectedConnector}
          onClick={onConnect}
          type="button"
        >
          {isConnecting ? 'Connecting' : 'Connect wallet'}
        </button>
        {!hasInjectedConnector && (
          <span className="welcome-wallet-note">Wallet connection is unavailable in this browser.</span>
        )}
      </div>

      <div className="welcome-lookup">
        <p>Or look up any public address</p>
        {children}
      </div>
    </section>
  );
}
