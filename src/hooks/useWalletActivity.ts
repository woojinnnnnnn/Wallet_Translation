import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { sampleTransactions } from '../data/sampleTransactions';
import {
  fetchAddressActivity,
  getSupportedActivityChain,
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
  const activityQuery = useQuery({
    queryKey: ['address-activity', address, chainId, isOwnWallet],
    queryFn: () => fetchAddressActivity(address!, chainId!, isOwnWallet),
    enabled: Boolean(address && chainId && supportedActivityChain),
    staleTime: 60_000,
  });
  const allTransactions = isConnected
    ? (activityQuery.data ?? [])
    : sampleTransactions;
  const transactions = filterTransactions(allTransactions, activityRange);
  const isActivityUnsupported = Boolean(
    isConnected && chainId && !supportedActivityChain,
  );

  return {
    activityQuery,
    activityRange,
    isActivityUnsupported,
    setActivityRange,
    transactions,
  };
}
