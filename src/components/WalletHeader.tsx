import type { Chain } from 'viem';
import type { Theme } from '../hooks/useTheme';

export function WalletHeader({
  activeChainSymbol,
  chain,
  connectedLabel,
  hasInjectedConnector,
  isConnected,
  isConnecting,
  onConnect,
  onDisconnect,
  onOpenRiskGuide,
  onToggleTheme,
  theme,
}: {
  activeChainSymbol?: string;
  chain?: Chain;
  connectedLabel: string;
  hasInjectedConnector: boolean;
  isConnected: boolean;
  isConnecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onOpenRiskGuide: () => void;
  onToggleTheme: () => void;
  theme: Theme;
}) {
  return (
    <section className="toolbar" aria-label="wallet controls">
      <div className="brand-block">
        <img
          className="app-logo"
          src={`/favicon-${theme}.png`}
          alt=""
          width={48}
          height={48}
        />
        <div>
          <p className="eyebrow">Wallet activity translator</p>
          <h1>Wallet activity translator: DEMO</h1>
          <p className="page-subtitle">
            A cleaner read on what moved, where it went, and which network it
            happened on.
          </p>
        </div>
      </div>
      <div className="wallet-actions">
        <button
          className="risk-guide-trigger"
          type="button"
          onClick={onOpenRiskGuide}
          aria-label="How risk levels are decided"
          title="How risk levels are decided"
        >
          ?
        </button>
        <button
          className="theme-toggle-button"
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <span className="theme-icon" key={theme}>
            {theme === 'dark' ? '☀' : '☽'}
          </span>
        </button>
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
