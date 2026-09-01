import type { Chain } from 'viem';

export function StatusMessages({
  activityError,
  chain,
  connectError,
  hasInjectedConnector,
  isActivityUnsupported,
  switchChainError,
}: {
  activityError?: Error | null;
  chain?: Chain;
  connectError?: Error | null;
  hasInjectedConnector: boolean;
  isActivityUnsupported: boolean;
  switchChainError?: Error | null;
}) {
  return (
    <>
      {connectError && (
        <p className="status status-error">
          {connectError.name === 'ProviderNotFoundError' ? (
            <>
              No wallet app was detected in this browser.{' '}
              <a
                href={`https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}${window.location.search}`}
              >
                Open in the MetaMask app
              </a>
              , or install the MetaMask extension.
            </>
          ) : (
            connectError.message
          )}
        </p>
      )}
      {switchChainError && (<p className="status status-error">{switchChainError.message}</p>)}
      {!hasInjectedConnector && (<p className="status status-error">No browser wallet extension was found.</p>)}
      {isActivityUnsupported && (<p className="status status-error">
          Transaction history is not supported on {chain?.name} yet. Switch to
          Ethereum, Base, Arbitrum One, Optimism, or Sepolia.
        </p>
      )}
      {activityError && (
        <p className="status status-error">{activityError.message}</p>
      )}
    </>
  );
}
