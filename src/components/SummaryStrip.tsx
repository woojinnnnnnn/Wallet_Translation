import { mainnetChains, testnetChains } from '../constants/chains';

export function SummaryStrip({
  isConnected,
  isFetching,
  transactionCount,
}: {
  isConnected: boolean;
  isFetching: boolean;
  transactionCount: number;
}) {
  // A count instead of a comma-separated name dump — that list only grows as
  // chains are added, and it had already gotten long enough to wrap across
  // multiple lines in this small a card. The full names still live in the
  // title tooltip and, more usefully, right below in the chain switcher.
  const networkNames = [...mainnetChains, ...testnetChains].map((chain) => chain.name).join(', ');

  return (
    <section className="summary-strip" aria-label="activity summary">
      <div className="summary-card summary-card-activity">
        <span>Recent activity</span>
        <strong>{isFetching ? 'Loading' : `${transactionCount} items`}</strong>
      </div>
      <div className="summary-card summary-card-networks" title={networkNames}>
        <span>Supported networks</span>
        <strong>
          {mainnetChains.length} networks + {testnetChains.length} testnets
        </strong>
      </div>
      <div className="summary-card summary-card-status">
        <span>Status</span>
        <strong>{isConnected ? 'Connected' : 'Sample data'}</strong>
      </div>
    </section>
  );
}
