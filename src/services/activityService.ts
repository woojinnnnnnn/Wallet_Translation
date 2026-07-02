import { formatEther, formatUnits } from 'viem';
import { knownAddresses } from '../constants/knownAddresses';
import {
  fetchAddressSecurity,
  fetchTokenSecurity,
  type AddressSecurityFlags,
  type TokenSecurityFlags,
} from './goplusService';
import { fetchUsdPrices, formatUsd } from './priceService';
import type {
  NormalizedTransaction,
  TransactionMovement,
  TransactionRisk,
} from '../types/activity';
import { shortenAddress, trimAmount } from '../utils/format';

type BlockscoutAddress = {
  ens_domain_name?: string | null;
  hash?: string;
  name?: string | null;
  is_scam?: boolean | null;
};

type BlockscoutTokenTransfer = {
  from?: BlockscoutAddress | null;
  to?: BlockscoutAddress | null;
  timestamp?: string;
  token?: {
    address?: string | null;
    decimals?: string | null;
    symbol?: string | null;
    type?: string | null;
  } | null;
  token_type?: string | null;
  total?: {
    decimals?: string | null;
    value?: string | null;
  } | null;
  transaction_hash: string;
  type?: string | null;
};

type BlockscoutTransaction = {
  from?: BlockscoutAddress | null;
  to?: BlockscoutAddress | null;
  hash: string;
  method?: string | null;
  decoded_input?: {
    method_call?: string | null;
    parameters?: Array<{
      name?: string | null;
      type?: string | null;
      value?: string | null;
    }> | null;
  } | null;
  timestamp?: string;
  transaction_types?: string[] | null;
  value?: string | null;
};

type BlockscoutListResponse<T> = {
  items?: T[];
};

type ChainActivityConfig = {
  apiBaseUrl: string;
  nativeSymbol: string;
};

const chainActivityConfig: Record<number, ChainActivityConfig> = {
  1: {
    apiBaseUrl: 'https://eth.blockscout.com/api/v2',
    nativeSymbol: 'ETH',
  },
  8453: {
    apiBaseUrl: 'https://base.blockscout.com/api/v2',
    nativeSymbol: 'ETH',
  },
  42161: {
    apiBaseUrl: 'https://arbitrum.blockscout.com/api/v2',
    nativeSymbol: 'ETH',
  },
  11155111: {
    apiBaseUrl: 'https://eth-sepolia.blockscout.com/api/v2',
    nativeSymbol: 'Sepolia ETH',
  },
};


export function getSupportedActivityChain(chainId?: number) {
  if (!chainId) {
    return undefined;
  }

  return chainActivityConfig[chainId];
}

export async function fetchAddressActivity(address: string, chainId: number) {
  const chainConfig = chainActivityConfig[chainId];

  if (!chainConfig) {
    throw new Error('Transaction history is not supported on this network yet.');
  }

  const encodedAddress = encodeURIComponent(address);
  const [tokenTransfers, transactions] = await Promise.all([
    fetchBlockscoutList<BlockscoutTokenTransfer>(
      `${chainConfig.apiBaseUrl}/addresses/${encodedAddress}/token-transfers`,
    ),
    fetchBlockscoutList<BlockscoutTransaction>(
      `${chainConfig.apiBaseUrl}/addresses/${encodedAddress}/transactions`,
    ),
  ]);

  const normalizedTokenTransfers = tokenTransfers
    .map((transfer) => normalizeTokenTransfer(transfer, address))
    .filter((transaction): transaction is NormalizedTransaction => Boolean(transaction));

  const normalizedNativeTransfers = transactions
    .map((transaction) =>
      normalizeNativeTransaction(transaction, address, chainConfig.nativeSymbol),
    )
    .filter((transaction): transaction is NormalizedTransaction => Boolean(transaction));
  const normalizedApprovals = transactions
    .map((transaction) => normalizeBlockscoutApproval(transaction, address))
    .filter((transaction): transaction is NormalizedTransaction => Boolean(transaction));

  // A zero-value call that also emits a Transfer event (e.g. calling a
  // token/router method that moves tokens as a side effect) already has a
  // clear explanation via the token transfer or approval above — only treat
  // it as an opaque "contract interaction" when nothing else explains it,
  // otherwise it duplicates the hash and gets merged into a confusing
  // "X + Contract" grouped-movement entry.
  const explainedHashes = new Set([
    ...normalizedTokenTransfers.map((tx) => tx.id),
    ...normalizedApprovals.map((tx) => tx.id),
  ]);
  const normalizedContractInteractions = transactions
    .map((transaction) => normalizeContractInteraction(transaction, address))
    .filter((transaction): transaction is NormalizedTransaction => Boolean(transaction))
    .filter((transaction) => !explainedHashes.has(transaction.id));

  const sorted = groupTransactions([
    ...normalizedApprovals,
    ...normalizedTokenTransfers,
    ...normalizedNativeTransfers,
    ...normalizedContractInteractions,
  ]).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  const sentTokenTransferHashes = [
    ...new Set(
      normalizedTokenTransfers
        .filter((tx) => tx.type === 'sent' && tx.tokenContractAddress)
        .map((tx) => tx.id),
    ),
  ];

  const [tokenSecurity, priceMap, addressSecurity, executedByOtherHashes] = await Promise.all([
    fetchTokenSecurity(chainId, collectTokenAddresses(sorted)),
    fetchUsdPrices(chainId, sorted),
    fetchAddressSecurity(collectSpenderAddresses(sorted)),
    detectExecutedByOthers(chainConfig.apiBaseUrl, sentTokenTransferHashes, address),
  ]);

  return applyExecutorRisk(
    applyAddressSecurity(
      applyUsdPrices(
        applyTokenSecurity(sorted, tokenSecurity.flags, tokenSecurity.failedAddresses),
        priceMap,
      ),
      addressSecurity.flags,
      addressSecurity.failedAddresses,
    ),
    executedByOtherHashes,
  );
}

async function fetchBlockscoutList<T>(url: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('Could not load transaction history.');
  }

  const data = (await response.json()) as BlockscoutListResponse<T>;
  return data.items ?? [];
}

// A transaction's signer never changes once mined, so this cache never
// expires — unlike prices or security flags, there's no "stale" case.
const transactionSenderCache = new Map<string, string>();

async function fetchTransactionSender(
  apiBaseUrl: string,
  hash: string,
): Promise<string | undefined> {
  const cached = transactionSenderCache.get(hash);
  if (cached) {
    return cached;
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(`${apiBaseUrl}/transactions/${hash}`, {
      signal: controller.signal,
    });

    if (!response.ok) return undefined;

    const data = (await response.json()) as { from?: BlockscoutAddress };
    const sender = data.from?.hash;

    if (sender) {
      transactionSenderCache.set(hash, sender);
    }

    return sender;
  } catch {
    return undefined;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

/**
 * A "sent" token transfer's from/to describe whose balance moved, not who
 * signed the transaction — a spender using an earlier approval to call
 * transferFrom looks identical to a self-initiated send unless we check who
 * actually executed it. Flags hashes where the real signer isn't the wallet
 * owner, so applyExecutorRisk can surface that instead of "standard transfer."
 */
async function detectExecutedByOthers(
  apiBaseUrl: string,
  hashes: string[],
  ownerAddress: string,
): Promise<Set<string>> {
  const flagged = new Set<string>();

  await Promise.all(
    hashes.map(async (hash) => {
      const sender = await fetchTransactionSender(apiBaseUrl, hash);
      if (sender && sender.toLowerCase() !== ownerAddress.toLowerCase()) {
        flagged.add(hash);
      }
    }),
  );

  return flagged;
}

function applyExecutorRisk(
  transactions: NormalizedTransaction[],
  executedByOtherHashes: Set<string>,
): NormalizedTransaction[] {
  if (executedByOtherHashes.size === 0) return transactions;

  return transactions.map((tx) => {
    if (tx.type !== 'sent' || !executedByOtherHashes.has(tx.id)) return tx;

    return {
      ...tx,
      risk: {
        level: 'high' as const,
        reason:
          'This transfer was executed by another address, not you — likely using an approval you granted earlier.',
      },
    };
  });
}

function normalizeTokenTransfer(
  transfer: BlockscoutTokenTransfer,
  ownerAddress: string,
): NormalizedTransaction | undefined {
  const fromHash = transfer.from?.hash ?? '';
  const toHash = transfer.to?.hash ?? '';
  const direction = getDirection(fromHash, toHash, ownerAddress);

  if (!direction) {
    return undefined;
  }

  const symbol = transfer.token?.symbol ?? transfer.token_type ?? 'TOKEN';
  const amount = formatTokenAmount(transfer);
  const from = labelAddress(transfer.from, ownerAddress);
  const to = labelAddress(transfer.to, ownerAddress);
  const fromAddress = transfer.from?.hash ?? '';
  const toAddress = transfer.to?.hash ?? '';
  const counterparty = direction === 'sent' ? transfer.to : transfer.from;

  return {
    id: transfer.transaction_hash,
    type: direction,
    from,
    fromAddress,
    to,
    toAddress,
    tokenContractAddress: transfer.token?.address ?? undefined,
    asset: symbol,
    amount,
    risk: getScamOverride(counterparty) ?? getTransferRisk(direction),
    summary:
      direction === 'sent'
        ? `${symbol} left your wallet.`
        : `${symbol} arrived in your wallet.`,
    timestamp: transfer.timestamp ?? new Date().toISOString(),
  };
}

function normalizeNativeTransaction(
  transaction: BlockscoutTransaction,
  ownerAddress: string,
  nativeSymbol: string,
): NormalizedTransaction | undefined {
  const value = BigInt(transaction.value ?? '0');

  if (value === 0n) {
    return undefined;
  }

  const fromHash = transaction.from?.hash ?? '';
  const toHash = transaction.to?.hash ?? '';
  const direction = getDirection(fromHash, toHash, ownerAddress);

  if (!direction) {
    return undefined;
  }

  const counterparty = direction === 'sent' ? transaction.to : transaction.from;

  return {
    id: transaction.hash,
    type: direction,
    from: labelAddress(transaction.from, ownerAddress),
    fromAddress: transaction.from?.hash ?? '',
    to: labelAddress(transaction.to, ownerAddress),
    toAddress: transaction.to?.hash ?? '',
    asset: nativeSymbol,
    amount: trimAmount(formatEther(value)),
    risk: getScamOverride(counterparty) ?? getTransferRisk(direction),
    summary:
      direction === 'sent'
        ? `${nativeSymbol} left your wallet.`
        : `${nativeSymbol} arrived in your wallet.`,
    timestamp: transaction.timestamp ?? new Date().toISOString(),
  };
}

function normalizeContractInteraction(
  transaction: BlockscoutTransaction,
  ownerAddress: string,
): NormalizedTransaction | undefined {
  const value = BigInt(transaction.value ?? '0');

  if (value !== 0n) {
    // Non-zero native transfers are handled by normalizeNativeTransaction.
    return undefined;
  }

  const fromHash = transaction.from?.hash ?? '';
  const toHash = transaction.to?.hash ?? '';

  if (fromHash.toLowerCase() !== ownerAddress.toLowerCase()) {
    return undefined;
  }

  if (!toHash || toHash.toLowerCase() === ownerAddress.toLowerCase()) {
    return undefined;
  }

  const scamOverride = getScamOverride(transaction.to);

  return {
    id: transaction.hash,
    type: 'contract',
    from: labelAddress(transaction.from, ownerAddress),
    fromAddress: fromHash,
    to: labelAddress(transaction.to, ownerAddress),
    toAddress: toHash,
    asset: 'Contract',
    amount: '—',
    risk: scamOverride ?? {
      level: 'unknown',
      reason: 'Contract interaction without enough context.',
    },
    summary: scamOverride
      ? 'You interacted with a contract flagged as a scam.'
      : 'You interacted with a contract — no token movement detected.',
    timestamp: transaction.timestamp ?? new Date().toISOString(),
  };
}

function normalizeBlockscoutApproval(
  transaction: BlockscoutTransaction,
  ownerAddress: string,
): NormalizedTransaction | undefined {
  const methodText =
    transaction.decoded_input?.method_call ?? transaction.method ?? '';
  const isUnlimited = isUnlimitedBlockscoutApproval(transaction.decoded_input?.parameters);
  const approvalKind = getApprovalKind(methodText, isUnlimited);
  const fromAddress = transaction.from?.hash ?? '';

  if (!approvalKind || fromAddress.toLowerCase() !== ownerAddress.toLowerCase()) {
    return undefined;
  }

  const tokenContractAddress = transaction.to?.hash ?? '';
  const spenderAddress = extractBlockscoutSpender(transaction.decoded_input?.parameters);

  return {
    id: transaction.hash,
    type: 'approval',
    from: labelAddress(transaction.from, ownerAddress),
    fromAddress,
    to: spenderAddress
      ? labelPlainAddress(spenderAddress, ownerAddress)
      : labelAddress(transaction.to, ownerAddress),
    toAddress: spenderAddress ?? tokenContractAddress,
    tokenContractAddress: tokenContractAddress || undefined,
    spenderAddress,
    asset: approvalKind.asset,
    amount: approvalKind.amount,
    risk: approvalKind.risk,
    summary: approvalKind.summary,
    timestamp: transaction.timestamp ?? new Date().toISOString(),
  };
}

function extractBlockscoutSpender(
  parameters?: Array<{ name?: string | null; type?: string | null; value?: string | null }> | null,
): string | undefined {
  if (!parameters) return undefined;

  const named = parameters.find(
    (p) => p.type === 'address' && (p.name === 'spender' || p.name === 'operator'),
  );
  if (named?.value) return named.value;

  const fallback = parameters.find((p) => p.type === 'address' && p.name !== 'owner');
  return fallback?.value ?? undefined;
}

const MAX_UINT256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

function isUnlimitedBlockscoutApproval(
  parameters?: Array<{ name?: string | null; type?: string | null; value?: string | null }> | null,
): boolean {
  if (!parameters) return false;
  const amountParam = parameters.find((p) => p.type === 'uint256');
  if (!amountParam?.value) return false;
  try {
    return BigInt(amountParam.value) === MAX_UINT256;
  } catch {
    return false;
  }
}

function getApprovalKind(
  methodText: string,
  isUnlimited = false,
):
  | {
      asset: string;
      amount: string;
      risk: TransactionRisk;
      summary: string;
    }
  | undefined {
  const method = methodText.toLowerCase();

  if (!method) {
    return undefined;
  }

  if (method.includes('setapprovalforall')) {
    return {
      asset: 'NFTs',
      amount: 'Collection approval',
      risk: {
        level: 'high',
        reason: 'NFT collection-wide approvals should be reviewed carefully.',
      },
      summary: 'You allowed another address to manage an NFT collection.',
    };
  }

  if (method.includes('permit')) {
    return {
      asset: 'Token access',
      amount: 'Permit approval',
      risk: {
        level: 'medium',
        reason: 'Signed permits can grant token spending access.',
      },
      summary: 'A signed permit granted token spending access.',
    };
  }

  if (
    method.includes('approve') ||
    method.includes('increaseallowance') ||
    method.includes('decreaseallowance')
  ) {
    if (isUnlimited) {
      return {
        asset: 'Token access',
        amount: 'Unlimited approval',
        risk: {
          level: 'high',
          reason: 'Unlimited spending approval — spender can drain your entire token balance.',
        },
        summary: 'You granted unlimited token spending access. The spender can take your full balance.',
      };
    }

    return {
      asset: 'Token access',
      amount: 'Spending approval',
      risk: {
        level: 'medium',
        reason: 'Token spending approvals should be reviewed.',
      },
      summary: 'You allowed another address to spend tokens from your wallet.',
    };
  }

  return undefined;
}

const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';

function getScamOverride(
  counterparty: BlockscoutAddress | null | undefined,
): TransactionRisk | undefined {
  if (counterparty?.is_scam !== true) {
    return undefined;
  }

  // The null address is a protocol sentinel for "minted/burned," not an
  // actor — Blockscout's own reputation data flags 0x0 itself as "scam"
  // (likely because countless scam tokens mint from it), which would
  // otherwise make every normal token mint show up as high risk.
  if (counterparty?.hash?.toLowerCase() === NULL_ADDRESS) {
    return undefined;
  }

  return {
    level: 'high',
    reason: 'This address is flagged as a scam by Blockscout.',
  };
}

function getTransferRisk(direction: 'sent' | 'received' | 'contract') {
  if (direction === 'contract') {
    return {
      level: 'unknown' as const,
      reason: 'Contract interaction without enough context.',
    };
  }

  return {
    level: 'low' as const,
    reason:
      direction === 'sent'
        ? 'Standard outgoing transfer.'
        : 'Standard incoming transfer.',
  };
}

function getDirection(from: string, to: string, ownerAddress: string) {
  const owner = ownerAddress.toLowerCase();

  if (from.toLowerCase() === owner && to.toLowerCase() === owner) {
    return 'contract' as const;
  }

  if (from.toLowerCase() === owner) {
    return 'sent' as const;
  }

  if (to.toLowerCase() === owner) {
    return 'received' as const;
  }

  return undefined;
}

function formatTokenAmount(transfer: BlockscoutTokenTransfer) {
  const tokenType = transfer.token_type ?? transfer.token?.type;
  const rawValue = transfer.total?.value;

  if (!rawValue) {
    return tokenType === 'ERC-721' ? '1' : 'Unknown';
  }

  if (tokenType === 'ERC-721') {
    return '1';
  }

  const decimals = Number(transfer.total?.decimals ?? transfer.token?.decimals ?? 0);
  return trimAmount(formatUnits(BigInt(rawValue), decimals));
}

function labelAddress(address: BlockscoutAddress | null | undefined, ownerAddress: string) {
  const hash = address?.hash;

  if (!hash) {
    return 'Unknown address';
  }

  if (hash.toLowerCase() === ownerAddress.toLowerCase()) {
    return 'My wallet';
  }

  return (
    knownAddresses[hash.toLowerCase()] ??
    address?.ens_domain_name ??
    address?.name ??
    `Unknown address ${shortenAddress(hash)}`
  );
}

function labelPlainAddress(address: string, ownerAddress: string) {
  if (!address) {
    return 'Unknown address';
  }

  if (address.toLowerCase() === ownerAddress.toLowerCase()) {
    return 'My wallet';
  }

  return knownAddresses[address.toLowerCase()] ?? `Unknown address ${shortenAddress(address)}`;
}

function groupTransactions(transactions: NormalizedTransaction[]) {
  const byHash = new Map<string, NormalizedTransaction[]>();

  for (const transaction of transactions) {
    const group = byHash.get(transaction.id) ?? [];
    group.push(transaction);
    byHash.set(transaction.id, group);
  }

  return Array.from(byHash.values()).map((group) => {
    const approval = group.find((transaction) => transaction.type === 'approval');

    if (approval) {
      return approval;
    }

    const sent = group.filter((transaction) => transaction.type === 'sent');
    const received = group.filter((transaction) => transaction.type === 'received');

    if (sent.length > 0 && received.length > 0) {
      return createSwapTransaction(group, sent, received);
    }

    if (group.length > 1) {
      return createGroupedMovementTransaction(group);
    }

    return group[0];
  });
}

function createSwapTransaction(
  group: NormalizedTransaction[],
  sent: NormalizedTransaction[],
  received: NormalizedTransaction[],
): NormalizedTransaction {
  const first = group[0];
  const sentAssets = compactUnique(sent.map((transaction) => transaction.asset)).join(' + ');
  const receivedAssets = compactUnique(
    received.map((transaction) => transaction.asset),
  ).join(' + ');

  return {
    ...first,
    type: 'swap',
    from: 'My wallet',
    fromAddress: first.fromAddress,
    to: 'My wallet',
    toAddress: first.toAddress,
    asset: `${sentAssets} -> ${receivedAssets}`,
    amount: `${summarizeMovementAmounts(sent)} -> ${summarizeMovementAmounts(received)}`,
    risk: {
      level: 'low',
      reason: 'Swap with both outgoing and incoming assets detected.',
    },
    summary: `${sentAssets} left your wallet and ${receivedAssets} came in.`,
    movements: group.map(toMovement),
  };
}

function createGroupedMovementTransaction(
  group: NormalizedTransaction[],
): NormalizedTransaction {
  const first = group[0];
  const assets = compactUnique(group.map((transaction) => transaction.asset)).join(' + ');

  return {
    ...first,
    asset: assets,
    amount: summarizeMovementAmounts(group),
    risk: {
      level: 'unknown',
      reason: 'Multiple token movements happened in one transaction.',
    },
    summary: `${group.length} token movements happened in this transaction.`,
    movements: group.map(toMovement),
  };
}

function toMovement(transaction: NormalizedTransaction): TransactionMovement {
  return {
    type: transaction.type === 'received' ? 'received' : 'sent',
    asset: transaction.asset,
    amount: transaction.amount,
    from: transaction.from,
    fromAddress: transaction.fromAddress,
    to: transaction.to,
    toAddress: transaction.toAddress,
  };
}

function summarizeMovementAmounts(transactions: NormalizedTransaction[]) {
  return transactions
    .map((transaction) => `${transaction.amount} ${transaction.asset}`)
    .join(' + ');
}

function compactUnique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function applyUsdPrices(
  transactions: NormalizedTransaction[],
  priceMap: Map<string, number>,
): NormalizedTransaction[] {
  if (priceMap.size === 0) return transactions;

  return transactions.map((tx) => {
    if (tx.type !== 'sent' && tx.type !== 'received') return tx;

    const key = tx.tokenContractAddress?.toLowerCase() ?? tx.asset;
    const price = priceMap.get(key);
    if (price === undefined) return tx;

    const amount = parseFloat(tx.amount.replace(/,/g, ''));
    if (Number.isNaN(amount)) return tx;

    return { ...tx, amountUsd: formatUsd(amount * price) };
  });
}

function collectTokenAddresses(transactions: NormalizedTransaction[]): string[] {
  return [
    ...new Set(
      transactions
        .filter((tx) => tx.tokenContractAddress)
        .map((tx) => tx.tokenContractAddress!),
    ),
  ];
}

function applyTokenSecurity(
  transactions: NormalizedTransaction[],
  securityMap: Map<string, TokenSecurityFlags>,
  failedAddresses: Set<string>,
): NormalizedTransaction[] {
  if (securityMap.size === 0 && failedAddresses.size === 0) return transactions;

  return transactions.map((tx) => {
    if (!tx.tokenContractAddress) return tx;
    const address = tx.tokenContractAddress.toLowerCase();

    if (failedAddresses.has(address)) {
      return { ...tx, riskCheckIncomplete: true };
    }

    const flags = securityMap.get(address);
    if (!flags) return tx;

    if (flags.isHoneypot) {
      return {
        ...tx,
        risk: {
          level: 'high' as const,
          reason: 'Honeypot detected — selling this token may be impossible.',
        },
      };
    }
    if (flags.isBlacklisted) {
      return {
        ...tx,
        risk: { level: 'high' as const, reason: 'This token address is blacklisted.' },
      };
    }
    if (flags.cannotSell) {
      return {
        ...tx,
        risk: {
          level: 'high' as const,
          reason: 'Token transfer restrictions detected — selling may be blocked.',
        },
      };
    }
    if (flags.hasHighTax) {
      return {
        ...tx,
        risk: {
          level: 'medium' as const,
          reason: 'High tax token (>10%) — significant fees on buy or sell.',
        },
      };
    }
    if (flags.isClosedSource) {
      return {
        ...tx,
        risk: {
          level: 'medium' as const,
          reason: 'Contract source code is not publicly verified.',
        },
      };
    }

    return tx;
  });
}

function collectSpenderAddresses(transactions: NormalizedTransaction[]): string[] {
  return [
    ...new Set(
      transactions
        .filter((tx) => tx.type === 'approval' && tx.spenderAddress)
        .map((tx) => tx.spenderAddress!),
    ),
  ];
}

function applyAddressSecurity(
  transactions: NormalizedTransaction[],
  addressSecurityMap: Map<string, AddressSecurityFlags>,
  failedAddresses: Set<string>,
): NormalizedTransaction[] {
  if (addressSecurityMap.size === 0 && failedAddresses.size === 0) return transactions;

  return transactions.map((tx) => {
    if (tx.type !== 'approval' || !tx.spenderAddress) return tx;
    const address = tx.spenderAddress.toLowerCase();

    if (failedAddresses.has(address)) {
      return { ...tx, riskCheckIncomplete: true };
    }

    const flags = addressSecurityMap.get(address);
    if (!flags?.isMalicious) return tx;

    return {
      ...tx,
      risk: {
        level: 'high' as const,
        reason: `Spender address flagged: ${flags.reasons.join(', ')}.`,
      },
    };
  });
}
