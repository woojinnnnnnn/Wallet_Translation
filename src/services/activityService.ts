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
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
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

type BlockscoutCursor = Record<string, string | number | boolean> | null;

type BlockscoutListResponse<T> = {
  items?: T[];
  next_page_params?: BlockscoutCursor;
};

type ChainActivityConfig = {
  apiBaseUrl: string;
  nativeSymbol: string;
  // Real contract addresses for widely-held tokens, keyed by the token's
  // normalized symbol (see normalizeSymbolForComparison). Dust/address-poisoning
  // transactions frequently spoof these symbols (e.g. a lookalike "USDT") on a
  // contract that isn't the genuine one — same trick as native-currency
  // impersonation below, just for tokens instead of the chain's native asset.
  protectedTokens?: Record<string, string>;
};

const chainActivityConfig: Record<number, ChainActivityConfig> = {
  1: {
    apiBaseUrl: 'https://eth.blockscout.com/api/v2',
    nativeSymbol: 'ETH',
    protectedTokens: {
      USDT: '0xdac17f958d2ee523a2206206994597c13d831ec7',
      USDC: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      DAI: '0x6b175474e89094c44da98b954eedeac495271d0f',
    },
  },
  8453: {
    apiBaseUrl: 'https://base.blockscout.com/api/v2',
    nativeSymbol: 'ETH',
    protectedTokens: {
      USDC: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
      DAI: '0x50c5725949a6f0c72e6c4a641f24049a917db0cb',
    },
  },
  42161: {
    apiBaseUrl: 'https://arbitrum.blockscout.com/api/v2',
    nativeSymbol: 'ETH',
    protectedTokens: {
      USDC: '0xaf88d065e77c8cc2239327c5edb3a432268e5831',
      DAI: '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1',
    },
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

export type ActivityPageParam = {
  tokenTransfersCursor: BlockscoutCursor;
  tokenTransfersExhausted: boolean;
  transactionsCursor: BlockscoutCursor;
  transactionsExhausted: boolean;
  rawTokenTransfers: BlockscoutTokenTransfer[];
  rawTransactions: BlockscoutTransaction[];
};

/**
 * Fetches one page of activity and re-runs the full normalize/group/enrich
 * pipeline over ALL raw records accumulated so far (not just the new page).
 * This keeps hash-based grouping (swap/approval detection) correct across
 * page boundaries, and is cheap to repeat because GoPlus/CoinGecko/executor
 * lookups are all cached — reprocessing an already-seen transaction is a
 * cache hit, not a new network request.
 */
export async function fetchAddressActivityPage(
  address: string,
  chainId: number,
  isOwnWallet: boolean,
  pageParam?: ActivityPageParam,
) {
  const chainConfig = chainActivityConfig[chainId];

  if (!chainConfig) {
    throw new Error('Transaction history is not supported on this network yet.');
  }

  const encodedAddress = encodeURIComponent(address);
  const tokenTransfersExhausted = pageParam?.tokenTransfersExhausted ?? false;
  const transactionsExhausted = pageParam?.transactionsExhausted ?? false;

  const [tokenTransfersResult, transactionsResult] = await Promise.all([
    tokenTransfersExhausted
      ? { items: pageParam!.rawTokenTransfers, nextPageParams: null as BlockscoutCursor }
      : fetchBlockscoutPage<BlockscoutTokenTransfer>(
          `${chainConfig.apiBaseUrl}/addresses/${encodedAddress}/token-transfers`,
          pageParam?.tokenTransfersCursor ?? null,
        ).then((page) => ({
          items: [...(pageParam?.rawTokenTransfers ?? []), ...page.items],
          nextPageParams: page.nextPageParams,
        })),
    transactionsExhausted
      ? { items: pageParam!.rawTransactions, nextPageParams: null as BlockscoutCursor }
      : fetchBlockscoutPage<BlockscoutTransaction>(
          `${chainConfig.apiBaseUrl}/addresses/${encodedAddress}/transactions`,
          pageParam?.transactionsCursor ?? null,
        ).then((page) => ({
          items: [...(pageParam?.rawTransactions ?? []), ...page.items],
          nextPageParams: page.nextPageParams,
        })),
  ]);

  const rawTokenTransfers = tokenTransfersResult.items;
  const rawTransactions = transactionsResult.items;

  const transactions = await processActivity(
    rawTokenTransfers,
    rawTransactions,
    chainConfig,
    chainId,
    address,
    isOwnWallet,
  );

  const nextTokenTransfersExhausted =
    tokenTransfersExhausted || !tokenTransfersResult.nextPageParams;
  const nextTransactionsExhausted =
    transactionsExhausted || !transactionsResult.nextPageParams;
  const hasMore = !nextTokenTransfersExhausted || !nextTransactionsExhausted;

  return {
    transactions,
    hasMore,
    nextPageParam: hasMore
      ? {
          tokenTransfersCursor: tokenTransfersResult.nextPageParams,
          tokenTransfersExhausted: nextTokenTransfersExhausted,
          transactionsCursor: transactionsResult.nextPageParams,
          transactionsExhausted: nextTransactionsExhausted,
          rawTokenTransfers,
          rawTransactions,
        }
      : undefined,
  };
}

async function processActivity(
  tokenTransfers: BlockscoutTokenTransfer[],
  transactions: BlockscoutTransaction[],
  chainConfig: ChainActivityConfig,
  chainId: number,
  address: string,
  isOwnWallet: boolean,
) {
  const normalizedTokenTransfers = tokenTransfers
    .map((transfer) => normalizeTokenTransfer(transfer, address, isOwnWallet, chainConfig))
    .filter((transaction): transaction is NormalizedTransaction => Boolean(transaction));

  const normalizedNativeTransfers = transactions
    .map((transaction) =>
      normalizeNativeTransaction(transaction, address, chainConfig.nativeSymbol, isOwnWallet),
    )
    .filter((transaction): transaction is NormalizedTransaction => Boolean(transaction));
  const normalizedApprovals = transactions
    .map((transaction) => normalizeBlockscoutApproval(transaction, address, isOwnWallet))
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
    .map((transaction) => normalizeContractInteraction(transaction, address, isOwnWallet))
    .filter((transaction): transaction is NormalizedTransaction => Boolean(transaction))
    .filter((transaction) => !explainedHashes.has(transaction.id));

  const sorted = groupTransactions(
    [
      ...normalizedApprovals,
      ...normalizedTokenTransfers,
      ...normalizedNativeTransfers,
      ...normalizedContractInteractions,
    ],
    isOwnWallet,
  ).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

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
    // isContractAddress decides whether the executor-mismatch check below is
    // even meaningful for this wallet; chained rather than awaited upfront
    // so it runs concurrently with the other three instead of blocking them.
    isContractAddress(chainConfig.apiBaseUrl, address).then((ownerIsContract) =>
      ownerIsContract
        ? new Set<string>()
        : detectExecutedByOthers(chainConfig.apiBaseUrl, sentTokenTransferHashes, address),
    ),
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

function buildPaginatedUrl(baseUrl: string, cursor: BlockscoutCursor) {
  if (!cursor) {
    return baseUrl;
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(cursor)) {
    params.set(key, String(value));
  }

  return `${baseUrl}?${params.toString()}`;
}

async function fetchBlockscoutPage<T>(baseUrl: string, cursor: BlockscoutCursor) {
  const response = await fetch(buildPaginatedUrl(baseUrl, cursor));

  if (!response.ok) {
    throw new Error('Could not load transaction history.');
  }

  const data = (await response.json()) as BlockscoutListResponse<T>;
  return {
    items: data.items ?? [],
    nextPageParams: data.next_page_params ?? null,
  };
}

// Whether an address is a contract never changes once it's deployed, so
// this cache never expires either.
const isContractCache = new Map<string, boolean>();

/**
 * Smart-contract wallets (Safe, ERC-4337 account abstraction, etc.) never
 * sign their own transactions — some other EOA (a Safe owner, a bundler)
 * always shows up as the tx signer even for a completely normal, authorized
 * send. detectExecutedByOthers' "someone else signed this" heuristic is
 * meaningless (and would false-positive on every single outgoing transfer)
 * for such wallets, so callers should skip it when the owner is a contract.
 *
 * On failure (timeout/network/non-OK), fails safe toward "assume contract"
 * rather than "assume EOA" — a missed executor-mismatch check for one fetch
 * is far less harmful than false-flagging a Safe's normal transfers as a
 * suspected drain, which is the exact bug this function exists to prevent.
 * Failure results aren't cached, since they're a fallback, not a real answer.
 */
async function isContractAddress(apiBaseUrl: string, address: string): Promise<boolean> {
  const key = `${apiBaseUrl}:${address.toLowerCase()}`;
  const cached = isContractCache.get(key);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const response = await fetchWithTimeout(`${apiBaseUrl}/addresses/${address}`);
    if (!response.ok) return true;

    const data = (await response.json()) as { is_contract?: boolean };
    const isContract = data.is_contract === true;
    isContractCache.set(key, isContract);
    return isContract;
  } catch {
    return true;
  }
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

  try {
    const response = await fetchWithTimeout(`${apiBaseUrl}/transactions/${hash}`);

    if (!response.ok) return undefined;

    const data = (await response.json()) as { from?: BlockscoutAddress };
    const sender = data.from?.hash;

    if (sender) {
      transactionSenderCache.set(hash, sender);
    }

    return sender;
  } catch {
    return undefined;
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
    // executedByOtherHashes is only ever seeded from hashes that had a
    // 'sent' token leg (see sentTokenTransferHashes below), so a flagged
    // hash always had an outgoing movement — but groupTransactions may have
    // since retyped it to 'swap' if the same hash also had an incoming leg
    // (the classic "drain disguised as a swap" pattern). Match both so the
    // flag survives grouping instead of being silently dropped.
    const canCarryExecutorRisk = tx.type === 'sent' || tx.type === 'swap';
    if (!canCarryExecutorRisk || !executedByOtherHashes.has(tx.id)) return tx;

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

// Greek/Cyrillic letters visually indistinguishable from Latin ones in most
// fonts — the exact trick a spoofed "ETH" symbol used (Greek Τ instead of
// Latin T). Deliberately small: just enough to cover letters that show up in
// native-currency symbols like ETH, not a general confusables table.
const CONFUSABLE_LETTERS: Record<string, string> = {
  Α: 'A', Β: 'B', Ε: 'E', Ζ: 'Z', Η: 'H', Ι: 'I', Κ: 'K', Μ: 'M', Ν: 'N',
  Ο: 'O', Ρ: 'P', Τ: 'T', Υ: 'Y', Χ: 'X',
  А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C',
  Т: 'T', Х: 'X', У: 'Y',
};

/**
 * A raw string-equality check on a token symbol is trivially defeated by
 * zero-width/combining Unicode characters spliced between visible letters,
 * or by swapping in a same-looking Greek/Cyrillic letter — both render as
 * "ETH" but neither is the ASCII string "ETH". Strips combining marks and
 * format characters (category Mn/Me/Cf — this is exactly how a real spoofed
 * token symbol we found looked: "E" + U+17B5 + "Τ" (Greek Tau) + U+17B5 +
 * "H"), then maps known look-alike letters back to Latin before comparing.
 *
 * Must decompose via NFKD, not recompose via NFKC: a plain "T" plus a
 * combining mark (e.g. U+0323 COMBINING DOT BELOW) has a canonical
 * precomposed form ("Ṭ", U+1E6C) that NFKC would merge into — and the
 * merged single codepoint is a letter, not a mark, so it survives the
 * Mn/Me/Cf strip below untouched and evades detection entirely (a real
 * spoofed "ETH" found in the wild used exactly this trick). NFKD instead
 * splits any such precomposed letter back into base + mark so the strip
 * still catches it.
 */
function normalizeSymbolForComparison(symbol: string): string {
  return symbol
    .normalize('NFKD')
    .replace(/[\p{Mn}\p{Me}\p{Cf}\s]/gu, '')
    .split('')
    .map((char) => CONFUSABLE_LETTERS[char] ?? char)
    .join('')
    .toUpperCase();
}

// A token contract can set its symbol to anything — neither the native
// currency symbol nor well-known token symbols like "USDT" are reserved.
// Naming an ERC-20 exactly like one of these is a known scam pattern (it
// looks identical to the real asset everywhere the symbol is shown), and
// it's also *why* an impersonating token has no CoinGecko price: the price
// lookup keys on tokenContractAddress, and the spoofing contract isn't the
// real, listed asset.
function detectSymbolImpersonation(
  symbol: string,
  tokenContractAddress: string | undefined,
  chainConfig: ChainActivityConfig,
): { impersonatedSymbol: string } | undefined {
  const normalizedSymbol = normalizeSymbolForComparison(symbol);

  if (normalizedSymbol === normalizeSymbolForComparison(chainConfig.nativeSymbol)) {
    return { impersonatedSymbol: chainConfig.nativeSymbol };
  }

  const realAddress = chainConfig.protectedTokens?.[normalizedSymbol];
  if (realAddress && tokenContractAddress?.toLowerCase() !== realAddress) {
    return { impersonatedSymbol: normalizedSymbol };
  }

  return undefined;
}

function normalizeTokenTransfer(
  transfer: BlockscoutTokenTransfer,
  ownerAddress: string,
  isOwnWallet: boolean,
  chainConfig: ChainActivityConfig,
): NormalizedTransaction | undefined {
  const fromHash = transfer.from?.hash ?? '';
  const toHash = transfer.to?.hash ?? '';
  const direction = getDirection(fromHash, toHash, ownerAddress);

  if (!direction) {
    return undefined;
  }

  const symbol = transfer.token?.symbol ?? transfer.token_type ?? 'TOKEN';
  const amount = formatTokenAmount(transfer);
  const from = labelAddress(transfer.from, ownerAddress, isOwnWallet);
  const to = labelAddress(transfer.to, ownerAddress, isOwnWallet);
  const fromAddress = transfer.from?.hash ?? '';
  const toAddress = transfer.to?.hash ?? '';
  const counterparty = direction === 'sent' ? transfer.to : transfer.from;
  const walletPhrase = isOwnWallet ? 'your wallet' : 'this wallet';
  const tokenContractAddress = transfer.token?.address ?? undefined;

  const impersonation = detectSymbolImpersonation(symbol, tokenContractAddress, chainConfig);

  return {
    id: transfer.transaction_hash,
    type: direction,
    from,
    fromAddress,
    to,
    toAddress,
    tokenContractAddress,
    asset: impersonation ? `${symbol} (token)` : symbol,
    amount,
    risk:
      getScamOverride(counterparty) ??
      (impersonation
        ? {
            level: 'high',
            reason: `This is a token contract calling itself "${symbol}" — not the real ${impersonation.impersonatedSymbol}. Likely impersonating a well-known token.`,
          }
        : getTransferRisk(direction)),
    summary:
      direction === 'sent'
        ? `${symbol} left ${walletPhrase}.`
        : `${symbol} arrived in ${walletPhrase}.`,
    timestamp: transfer.timestamp ?? new Date().toISOString(),
  };
}

function normalizeNativeTransaction(
  transaction: BlockscoutTransaction,
  ownerAddress: string,
  nativeSymbol: string,
  isOwnWallet: boolean,
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
  const walletPhrase = isOwnWallet ? 'your wallet' : 'this wallet';

  return {
    id: transaction.hash,
    type: direction,
    from: labelAddress(transaction.from, ownerAddress, isOwnWallet),
    fromAddress: transaction.from?.hash ?? '',
    to: labelAddress(transaction.to, ownerAddress, isOwnWallet),
    toAddress: transaction.to?.hash ?? '',
    asset: nativeSymbol,
    amount: trimAmount(formatEther(value)),
    risk: getScamOverride(counterparty) ?? getTransferRisk(direction),
    summary:
      direction === 'sent'
        ? `${nativeSymbol} left ${walletPhrase}.`
        : `${nativeSymbol} arrived in ${walletPhrase}.`,
    timestamp: transaction.timestamp ?? new Date().toISOString(),
  };
}

function normalizeContractInteraction(
  transaction: BlockscoutTransaction,
  ownerAddress: string,
  isOwnWallet: boolean,
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
    from: labelAddress(transaction.from, ownerAddress, isOwnWallet),
    fromAddress: fromHash,
    to: labelAddress(transaction.to, ownerAddress, isOwnWallet),
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
  isOwnWallet: boolean,
): NormalizedTransaction | undefined {
  const methodText =
    transaction.decoded_input?.method_call ?? transaction.method ?? '';
  const isUnlimited = isUnlimitedBlockscoutApproval(transaction.decoded_input?.parameters);
  const approvalKind = getApprovalKind(methodText, isUnlimited, isOwnWallet);
  const fromAddress = transaction.from?.hash ?? '';

  if (!approvalKind || fromAddress.toLowerCase() !== ownerAddress.toLowerCase()) {
    return undefined;
  }

  const tokenContractAddress = transaction.to?.hash ?? '';
  const spenderAddress = extractBlockscoutSpender(transaction.decoded_input?.parameters);

  return {
    id: transaction.hash,
    type: 'approval',
    from: labelAddress(transaction.from, ownerAddress, isOwnWallet),
    fromAddress,
    to: spenderAddress
      ? labelPlainAddress(spenderAddress, ownerAddress, isOwnWallet)
      : labelAddress(transaction.to, ownerAddress, isOwnWallet),
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
  isOwnWallet = true,
):
  | {
      asset: string;
      amount: string;
      risk: TransactionRisk;
      summary: string;
    }
  | undefined {
  const method = methodText.toLowerCase();
  const walletPhrase = isOwnWallet ? 'your wallet' : 'this wallet';

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
      summary: `You allowed another address to spend tokens from ${walletPhrase}.`,
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

function labelAddress(
  address: BlockscoutAddress | null | undefined,
  ownerAddress: string,
  isOwnWallet: boolean,
) {
  const hash = address?.hash;

  if (!hash) {
    return 'Unknown address';
  }

  if (hash.toLowerCase() === ownerAddress.toLowerCase()) {
    return isOwnWallet ? 'My wallet' : 'This wallet';
  }

  return (
    knownAddresses[hash.toLowerCase()] ??
    address?.ens_domain_name ??
    address?.name ??
    `Unknown address ${shortenAddress(hash)}`
  );
}

function labelPlainAddress(address: string, ownerAddress: string, isOwnWallet: boolean) {
  if (!address) {
    return 'Unknown address';
  }

  if (address.toLowerCase() === ownerAddress.toLowerCase()) {
    return isOwnWallet ? 'My wallet' : 'This wallet';
  }

  return knownAddresses[address.toLowerCase()] ?? `Unknown address ${shortenAddress(address)}`;
}

function groupTransactions(transactions: NormalizedTransaction[], isOwnWallet: boolean) {
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
      return createSwapTransaction(group, sent, received, isOwnWallet);
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
  isOwnWallet: boolean,
): NormalizedTransaction {
  const first = group[0];
  const sentAssets = compactUnique(sent.map((transaction) => transaction.asset)).join(' + ');
  const receivedAssets = compactUnique(
    received.map((transaction) => transaction.asset),
  ).join(' + ');

  // As with createGroupedMovementTransaction: don't let a clean "it's a
  // swap" default erase a high/medium risk any individual leg already
  // carried (e.g. a scam-flagged counterparty on one side).
  const strongestRisk = mostSevereRisk(group.map((transaction) => transaction.risk));
  const risk: TransactionRisk =
    strongestRisk && strongestRisk.level !== 'low'
      ? strongestRisk
      : { level: 'low', reason: 'Swap with both outgoing and incoming assets detected.' };

  const ownerLabel = isOwnWallet ? 'My wallet' : 'This wallet';
  const walletPhrase = isOwnWallet ? 'your wallet' : 'this wallet';

  return {
    ...first,
    type: 'swap',
    from: ownerLabel,
    fromAddress: first.fromAddress,
    to: ownerLabel,
    toAddress: first.toAddress,
    asset: `${sentAssets} -> ${receivedAssets}`,
    amount: `${summarizeMovementAmounts(sent)} -> ${summarizeMovementAmounts(received)}`,
    risk,
    summary: `${sentAssets} left ${walletPhrase} and ${receivedAssets} came in.`,
    movements: group.map(toMovement),
  };
}

const RISK_SEVERITY: Record<TransactionRisk['level'], number> = {
  high: 3,
  medium: 2,
  unknown: 1,
  low: 0,
};

function mostSevereRisk(risks: TransactionRisk[]): TransactionRisk | undefined {
  return risks.reduce<TransactionRisk | undefined>((worst, risk) => {
    if (!worst || RISK_SEVERITY[risk.level] > RISK_SEVERITY[worst.level]) return risk;
    return worst;
  }, undefined);
}

function createGroupedMovementTransaction(
  group: NormalizedTransaction[],
): NormalizedTransaction {
  const first = group[0];
  const assets = compactUnique(group.map((transaction) => transaction.asset)).join(' + ');

  // Individual movements may already carry a high/medium risk (e.g. a
  // Blockscout scam-address flag). Merging them shouldn't silently erase
  // that — only fall back to the generic "multiple movements" caveat when
  // none of the movements had anything more specific to say.
  const strongestRisk = mostSevereRisk(group.map((transaction) => transaction.risk));
  const risk: TransactionRisk =
    strongestRisk && strongestRisk.level !== 'low'
      ? strongestRisk
      : { level: 'unknown', reason: 'Multiple token movements happened in one transaction.' };

  return {
    ...first,
    asset: assets,
    amount: summarizeMovementAmounts(group),
    risk,
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

// Sums per asset rather than listing every leg individually — a batch send
// with 8 outgoing ETH transfers should read as one ETH total, not eight
// concatenated numbers. Legs with a non-numeric amount (e.g. a bare contract
// interaction's '—') are dropped from the sum; there's nothing to add.
function summarizeMovementAmounts(transactions: NormalizedTransaction[]) {
  const totalsByAsset = new Map<string, number>();

  for (const transaction of transactions) {
    const numericAmount = Number(transaction.amount.replace(/,/g, ''));

    if (Number.isNaN(numericAmount)) {
      continue;
    }

    totalsByAsset.set(
      transaction.asset,
      (totalsByAsset.get(transaction.asset) ?? 0) + numericAmount,
    );
  }

  return Array.from(totalsByAsset.entries())
    .map(([asset, total]) => `${trimAmount(String(total))} ${asset}`)
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
