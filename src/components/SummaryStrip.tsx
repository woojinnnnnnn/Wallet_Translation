export function SummaryStrip({
  isConnected,
  isFetching,
  transactionCount,
}: {
  isConnected: boolean;
  isFetching: boolean;
  transactionCount: number;
}) {
  return (
    <section className="summary-strip" aria-label="activity summary">
      <div className="summary-card summary-card-activity">
        <span>Recent activity</span>
        <strong>{isFetching ? 'Loading' : `${transactionCount} items`}</strong>
      </div>
      <div className="summary-card summary-card-networks">
        <span>Supported networks</span>
        <strong>Ethereum, Sepolia, Base, Arbitrum One, Optimism (ETH)</strong>
      </div>
      <div className="summary-card summary-card-status">
        <span>Status</span>
        <strong>{isConnected ? 'Connected' : 'Sample data'}</strong>
      </div>
    </section>
  );
}
