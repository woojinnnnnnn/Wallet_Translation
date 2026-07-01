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
      <div>
        <span>Recent activity</span>
        <strong>{isFetching ? 'Loading' : `${transactionCount} items`}</strong>
      </div>
      <div>
        <span>Supported networks</span>
        <strong>Ethereum, Sepolia, Polygon(Test), Amoy(not api key init yet..)</strong>
      </div>
      <div>
        <span>Status</span>
        <strong>{isConnected ? 'Connected' : 'Sample data'}</strong>
      </div>
    </section>
  );
}
