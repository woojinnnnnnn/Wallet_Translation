import type { Chain } from 'viem';

// wagmi/viem errors extend viem's BaseError, whose `.message` is a
// multi-line dump ("<short message>\n\nDocs: ...\nVersion: viem@x.x.x") meant
// for a developer console, not a user-facing UI. `.shortMessage` is the same
// error with just the human-readable first line — fall back to `.message`
// for plain (non-viem) Errors, which don't have the extra trailer to strip.
function getFriendlyMessage(error: Error): string {
  const shortMessage = (error as { shortMessage?: string }).shortMessage;
  return shortMessage ?? error.message;
}

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
            getFriendlyMessage(connectError)
          )}
        </p>
      )}
      {switchChainError && (
        <p className="status status-error">{getFriendlyMessage(switchChainError)}</p>
      )}
      {!hasInjectedConnector && (<p className="status status-error">No browser wallet extension was found.</p>)}
      {isActivityUnsupported && (<p className="status status-error">
          Transaction history is not supported on {chain?.name} yet. Switch to
          Ethereum, Base, Arbitrum One, Optimism, or Sepolia.
        </p>
      )}
      {activityError && (
        <p className="status status-error">
          {activityError.name === 'TypeError'
            ? "Couldn't reach this network's API right now — it may be temporarily down. Try again shortly, or switch chains (check the status dot next to each network above)."
            : getFriendlyMessage(activityError)}
        </p>
      )}
    </>
  );
}
