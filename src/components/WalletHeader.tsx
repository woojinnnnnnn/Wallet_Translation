import type { Chain } from 'viem';

export function WalletHeader({
  activeChainSymbol,
  chain,
  connectedLabel,
  hasInjectedConnector,
  isConnected,
  isConnecting,
  onConnect,
  onDisconnect,
}: {
  activeChainSymbol?: string;
  chain?: Chain;
  connectedLabel: string;
  hasInjectedConnector: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  return (
    <section className="toolbar" aria-label="wallet controls">
      <div>
        <p className="eyebrow">Wallet activity translator</p>
        <h1>Wallet activity translator: DEMO</h1>
        <p className="page-subtitle">
          A cleaner read on what moved, where it went, and which network it
          happened on.
        </p>
      </div>
      <div className="wallet-actions">
        <button
          className="connect-button"
          type="button"
          onClick={isConnected ? onDisconnect : onConnect}
          disabled={isConnecting || !hasInjectedConnector}
        >
          {isConnecting
            ? 'Connecting'
            : isConnected
              ? `Disconnect ${connectedLabel}`
              : connectedLabel}
        </button>
        {isConnected && chain && (
          <span className="chain-badge">
            {chain.name}
            {activeChainSymbol && (
              <span className="symbol-mini">{activeChainSymbol}</span>
            )}
          </span>
        )}
      </div>
    </section>
  );
}
