import type { Chain } from 'viem';
import { mainnetChains, testnetChains } from '../constants/chains';

// Derived from the actual chain lists (rather than a hardcoded string) so
// this message can't drift out of sync the way it already had once before —
// adding a chain updates this automatically.
const supportedChainNames = [...mainnetChains, ...testnetChains].map((chain) => chain.name);

function joinWithOr(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')}, or ${items[items.length - 1]}`;
}

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
              No wallet was detected in this browser. Install a browser
              wallet extension (MetaMask, Rabby, Coinbase Wallet, etc.), or{' '}
              <a
                href={`https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}${window.location.search}`}
              >
                open this page in the MetaMask app
              </a>{' '}
              on mobile.
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
          Transaction history is not supported on {chain?.name} yet. Switch to{' '}
          {joinWithOr(supportedChainNames)}.
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
