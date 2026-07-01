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
      {connectError && (<p className="status status-error">{connectError.message}</p>)}
      {switchChainError && (<p className="status status-error">{switchChainError.message}</p>)}
      {!hasInjectedConnector && (<p className="status status-error">No browser wallet extension was found.</p>)}
      {isActivityUnsupported && (<p className="status status-error">
          Transaction history is not supported on {chain?.name} yet. Switch to
          Ethereum, Sepolia, Polygon, or Polygon Amoy.
        </p>
      )}
      {activityError && (
        <p className="status status-error">{activityError.message}</p>
      )}
    </>
  );
}
