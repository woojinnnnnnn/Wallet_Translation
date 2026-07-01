import { formatEther, formatUnits } from 'viem';
import { knownAddresses } from '../constants/knownAddresses';
import { fetchTokenSecurity, type TokenSecurityFlags } from './goplusService';
import type {
  NormalizedTransaction,
  TransactionMovement,
  TransactionRisk,
} from '../types/activity';
import { shortenAddress, timestampFromSeconds, trimAmount } from '../utils/format';

type BlockscoutAddress = {
  ens_domain_name?: string | null;
  hash?: string;
  name?: string | null;
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
  provider: 'blockscout' | 'etherscan';
  apiBaseUrl: string;
  nativeSymbol: string;
};

const chainActivityConfig: Record<number, ChainActivityConfig> = {
  1: {
    provider: 'blockscout',
    apiBaseUrl: 'https://eth.blockscout.com/api/v2',
    nativeSymbol: 'ETH',
  },
  11155111: {
    provider: 'blockscout',
    apiBaseUrl: 'https://eth-sepolia.blockscout.com/api/v2',
    nativeSymbol: 'Sepolia ETH',
  },
  137: {
    provider: 'blockscout',
    apiBaseUrl: 'https://polygon.blockscout.com/api/v2',
    nativeSymbol: 'POL',
  },
  80002: {
    provider: 'etherscan',
    apiBaseUrl: 'https://api.etherscan.io/v2/api',
    nativeSymbol: 'POL',
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

  if (chainConfig.provider === 'etherscan') {
    return fetchEtherscanAddressActivity(address, chainId, chainConfig);
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

  const sorted = groupTransactions([
    ...normalizedApprovals,
    ...normalizedTokenTransfers,
    ...normalizedNativeTransfers,
  ]).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  const securityMap = await fetchTokenSecurity(chainId, collectTokenAddresses(sorted));
  return applyTokenSecurity(sorted, securityMap);
}

type EtherscanListResponse<T> = {
  status: string;
  message: string;
  result: T[] | string;
};

type EtherscanTransaction = {
  hash: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string;
  functionName?: string;
  input?: string;
  methodId?: string;
};

type EtherscanTokenTransfer = {
  hash: string;
  timeStamp: string;
  from: string;
  to: string;
  tokenDecimal: string;
  tokenSymbol: string;
  value: string;
  contractAddress?: string;
};

async function fetchEtherscanAddressActivity(
  address: string,
  chainId: number,
  chainConfig: ChainActivityConfig,
) {
  const apiKey = import.meta.env.VITE_ETHERSCAN_API_KEY;

  if (!apiKey) {
    throw new Error(
      'Polygon Amoy history requires VITE_ETHERSCAN_API_KEY in your .env file.',
    );
  }

  const [tokenTransfers, transactions] = await Promise.all([
    fetchEtherscanList<EtherscanTokenTransfer>(
      chainConfig.apiBaseUrl,
      chainId,
      address,
      apiKey,
      'tokentx',
    ),
    fetchEtherscanList<EtherscanTransaction>(
      chainConfig.apiBaseUrl,
      chainId,
      address,
      apiKey,
      'txlist',
    ),
  ]);

  const normalizedTokenTransfers = tokenTransfers
    .map((transfer) => normalizeEtherscanTokenTransfer(transfer, address))
    .filter((transaction): transaction is NormalizedTransaction => Boolean(transaction));

  const normalizedNativeTransfers = transactions
    .map((transaction) =>
      normalizeEtherscanNativeTransaction(
        transaction,
        address,
        chainConfig.nativeSymbol,
      ),
    )
    .filter((transaction): transaction is NormalizedTransaction => Boolean(transaction));
  const normalizedApprovals = transactions
    .map((transaction) => normalizeEtherscanApproval(transaction, address))
    .filter((transaction): transaction is NormalizedTransaction => Boolean(transaction));

  const sorted = groupTransactions([
    ...normalizedApprovals,
    ...normalizedTokenTransfers,
    ...normalizedNativeTransfers,
  ]).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  const securityMap = await fetchTokenSecurity(chainId, collectTokenAddresses(sorted));
  return applyTokenSecurity(sorted, securityMap);
}

async function fetchEtherscanList<T>(
  apiBaseUrl: string,
  chainId: number,
  address: string,
  apiKey: string,
  action: 'tokentx' | 'txlist',
) {
  const params = new URLSearchParams({
    chainid: String(chainId),
    module: 'account',
    action,
    address,
    page: '1',
    offset: '50',
    sort: 'desc',
    apikey: apiKey,
  });
  const response = await fetch(`${apiBaseUrl}?${params.toString()}`);

  if (!response.ok) {
    throw new Error('Could not load transaction history.');
  }

  const data = (await response.json()) as EtherscanListResponse<T>;

  if (data.status === '0') {
    if (data.message === 'No transactions found') {
      return [];
    }

    throw new Error(
      typeof data.result === 'string' ? data.result : 'Could not load transaction history.',
    );
  }

  return Array.isArray(data.result) ? data.result : [];
}

function normalizeEtherscanTokenTransfer(
  transfer: EtherscanTokenTransfer,
  ownerAddress: string,
): NormalizedTransaction | undefined {
  const direction = getDirection(transfer.from, transfer.to, ownerAddress);

  if (!direction) {
    return undefined;
  }

  const symbol = transfer.tokenSymbol || 'TOKEN';

  return {
    id: transfer.hash,
    type: direction,
    from: labelPlainAddress(transfer.from, ownerAddress),
    fromAddress: transfer.from,
    to: labelPlainAddress(transfer.to, ownerAddress),
    toAddress: transfer.to,
    tokenContractAddress: transfer.contractAddress || undefined,
    asset: symbol,
    amount: trimAmount(formatUnits(BigInt(transfer.value), Number(transfer.tokenDecimal))),
    risk: getTransferRisk(direction),
    summary:
      direction === 'sent'
        ? `${symbol} left your wallet.`
        : `${symbol} arrived in your wallet.`,
    timestamp: timestampFromSeconds(transfer.timeStamp),
  };
}

function normalizeEtherscanNativeTransaction(
  transaction: EtherscanTransaction,
  ownerAddress: string,
  nativeSymbol: string,
): NormalizedTransaction | undefined {
  const value = BigInt(transaction.value);

  if (value === 0n) {
    return undefined;
  }

  const direction = getDirection(transaction.from, transaction.to, ownerAddress);

  if (!direction) {
    return undefined;
  }

  return {
    id: transaction.hash,
    type: direction,
    from: labelPlainAddress(transaction.from, ownerAddress),
    fromAddress: transaction.from,
    to: labelPlainAddress(transaction.to, ownerAddress),
    toAddress: transaction.to,
    asset: nativeSymbol,
    amount: trimAmount(formatEther(value)),
    risk: getTransferRisk(direction),
    summary:
      direction === 'sent'
        ? `${nativeSymbol} left your wallet.`
        : `${nativeSymbol} arrived in your wallet.`,
    timestamp: timestampFromSeconds(transaction.timeStamp),
  };
}

function normalizeEtherscanApproval(
  transaction: EtherscanTransaction,
  ownerAddress: string,
): NormalizedTransaction | undefined {
  const isUnlimited = isUnlimitedEtherscanApproval(transaction.input);
  const approvalKind = getApprovalKind(
    transaction.functionName ?? transaction.input ?? transaction.methodId ?? '',
    isUnlimited,
  );

  if (!approvalKind || transaction.from.toLowerCase() !== ownerAddress.toLowerCase()) {
    return undefined;
  }

  return {
    id: transaction.hash,
    type: 'approval',
    from: labelPlainAddress(transaction.from, ownerAddress),
    fromAddress: transaction.from,
    to: labelPlainAddress(transaction.to, ownerAddress),
    toAddress: transaction.to,
    tokenContractAddress: transaction.to || undefined,
    asset: approvalKind.asset,
    amount: approvalKind.amount,
    risk: approvalKind.risk,
    summary: approvalKind.summary,
    timestamp: timestampFromSeconds(transaction.timeStamp),
  };
}

async function fetchBlockscoutList<T>(url: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('Could not load transaction history.');
  }

  const data = (await response.json()) as BlockscoutListResponse<T>;
  return data.items ?? [];
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
    risk: getTransferRisk(direction),
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

  return {
    id: transaction.hash,
    type: direction,
    from: labelAddress(transaction.from, ownerAddress),
    fromAddress: transaction.from?.hash ?? '',
    to: labelAddress(transaction.to, ownerAddress),
    toAddress: transaction.to?.hash ?? '',
    asset: nativeSymbol,
    amount: trimAmount(formatEther(value)),
    risk: getTransferRisk(direction),
    summary:
      direction === 'sent'
        ? `${nativeSymbol} left your wallet.`
        : `${nativeSymbol} arrived in your wallet.`,
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

  const toAddress = transaction.to?.hash ?? '';

  return {
    id: transaction.hash,
    type: 'approval',
    from: labelAddress(transaction.from, ownerAddress),
    fromAddress,
    to: labelAddress(transaction.to, ownerAddress),
    toAddress,
    tokenContractAddress: toAddress || undefined,
    asset: approvalKind.asset,
    amount: approvalKind.amount,
    risk: approvalKind.risk,
    summary: approvalKind.summary,
    timestamp: transaction.timestamp ?? new Date().toISOString(),
  };
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

function isUnlimitedEtherscanApproval(input?: string): boolean {
  if (!input || input.length < 138) return false;
  const selector = input.slice(0, 10).toLowerCase();
  // approve(address,uint256): 0x095ea7b3  increaseAllowance(address,uint256): 0x39509351
  if (selector !== '0x095ea7b3' && selector !== '0x39509351') return false;
  return input.slice(-64).toLowerCase() === 'f'.repeat(64);
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
): NormalizedTransaction[] {
  if (securityMap.size === 0) return transactions;

  return transactions.map((tx) => {
    if (!tx.tokenContractAddress) return tx;
    const flags = securityMap.get(tx.tokenContractAddress.toLowerCase());
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
