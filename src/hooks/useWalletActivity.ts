import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { sampleTransactions } from '../data/sampleTransactions';
import {
  fetchAddressActivityPage,
  getSupportedActivityChain,
  type ActivityPageParam,
} from '../services/activityService';
import type { ActivityRange, NormalizedTransaction } from '../types/activity';

function filterTransactions(
  transactions: NormalizedTransaction[],
  range: ActivityRange,
) {
  if (range === 'latest') {
    return transactions.slice(0, 12);
  }

  if (range === 'all') {
    return transactions;
  }

  const days = range === '7d' ? 7 : 30;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  return transactions.filter((transaction) => {
    const timestamp = Date.parse(transaction.timestamp);
    return !Number.isNaN(timestamp) && timestamp >= cutoff;
  });
}

export function useWalletActivity({
  address,
  chainId,
  isConnected,
  isOwnWallet = true,
}: {
  address?: string;
  chainId?: number;
  isConnected: boolean;
  isOwnWallet?: boolean;
}) {
  const [activityRange, setActivityRange] = useState<ActivityRange>('latest');
  const supportedActivityChain = getSupportedActivityChain(chainId);
  const activityQuery = useInfiniteQuery({
    queryKey: ['address-activity', address, chainId, isOwnWallet],
    queryFn: ({ pageParam }) =>
      fetchAddressActivityPage(address!, chainId!, isOwnWallet, pageParam),
    initialPageParam: undefined as ActivityPageParam | undefined,
    getNextPageParam: (lastPage) => lastPage.nextPageParam,
    enabled: Boolean(address && chainId && supportedActivityChain),
    staleTime: 60_000,
  });
  // Each page already carries the full accumulated + re-grouped list (see
  // fetchAddressActivityPage), so the latest page IS the current dataset —
  // don't flatten pages, that would duplicate every earlier transaction.
  const latestPage = activityQuery.data?.pages.at(-1);
  const allTransactions = isConnected
    ? (latestPage?.transactions ?? [])
    : sampleTransactions;
  const transactions = filterTransactions(allTransactions, activityRange);
  const isActivityUnsupported = Boolean(
    isConnected && chainId && !supportedActivityChain,
  );
  // Loading more only ever affects the '7d'/'30d'/'all' views — 'latest'
  // is capped to the first 12 regardless of how much more gets fetched.
  const canLoadMore =
    activityRange !== 'latest' && isConnected && Boolean(activityQuery.hasNextPage);

  return {
    activityQuery,
    activityRange,
    canLoadMore,
    isActivityUnsupported,
    isFetchingMore: activityQuery.isFetchingNextPage,
    loadMore: () => activityQuery.fetchNextPage(),
    setActivityRange,
    transactions,
  };
}
