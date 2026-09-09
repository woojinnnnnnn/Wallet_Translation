import type { Chain } from 'viem';
import type { NormalizedTransaction } from '../types/activity';
import { SkeletonCard } from './SkeletonCard';
import { TransactionCard } from './TransactionCard';

export function TransactionList({
  activeChainSymbol,
  canLoadMore,
  chain,
  copiedAddress,
  copiedTransactionId,
  expandedTransactionId,
  hasError,
  isConnected,
  isFetching,
  isFetchingMore,
  isFiltered,
  isOwnWalletView,
  onCopyAddress,
  onCopyHash,
  onLoadMore,
  onToggleTransaction,
  transactions,
}: {
  activeChainSymbol?: string;
  canLoadMore: boolean;
  chain?: Chain;
  copiedAddress: string | null;
  copiedTransactionId: string | null;
  expandedTransactionId: string | null;
  hasError: boolean;
  isConnected: boolean;
  isFetching: boolean;
  isFetchingMore: boolean;
  isFiltered: boolean;
  isOwnWalletView: boolean;
  onCopyAddress: (address: string) => void;
  onCopyHash: (hash: string) => void;
  onLoadMore: () => void;
  onToggleTransaction: (transactionId: string) => void;
  transactions: NormalizedTransaction[];
}) {
  return (
    <section className="transaction-list" aria-label="recent transactions">
      {isFetching &&
        Array.from({ length: 5 }, (_, i) => (
          <SkeletonCard key={i} delay={i * 90} />
        ))
      }
      {/* A failed fetch already gets its own message via StatusMessages —
          showing "no activity found" on top of that reads as two
          contradictory answers to the same question. */}
      {!isFetching && !hasError && isConnected && transactions.length === 0 && (
        <div className="empty-state">
          {isFiltered
            ? "No transactions match this filter — try Load more or switch it back to All."
            : 'No recent movement history found for this wallet.'}
        </div>
      )}
      {!isFetching &&
        transactions.map((transaction) => (
          <TransactionCard
            activeChainSymbol={activeChainSymbol}
            chain={chain}
            copiedAddress={copiedAddress}
            copiedTransactionId={copiedTransactionId}
            isConnected={isConnected}
            isExpanded={expandedTransactionId === transaction.id}
            isOwnWalletView={isOwnWalletView}
            key={transaction.id}
            onCopyAddress={onCopyAddress}
            onCopyHash={onCopyHash}
            onToggle={onToggleTransaction}
            transaction={transaction}
          />
        ))}
      {!isFetching && canLoadMore && (
        <button
          className="load-more-button"
          disabled={isFetchingMore}
          onClick={onLoadMore}
          type="button"
          aria-busy={isFetchingMore}
        >
          {isFetchingMore ? 'Loading more…' : 'Load more'}
        </button>
      )}
    </section>
  );
}
