import type { NormalizedTransaction } from '../types/activity';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { TtlCache } from '../utils/ttlCache';

const PRICE_CACHE_TTL_MS = 5 * 60_000;
const priceCache = new TtlCache<number>(PRICE_CACHE_TTL_MS);

// CoinGecko's free tier throttles to only a few requests per short window
// (observed: 429s after ~3 rapid calls) — this leaves headroom for the
// native-currency lookup that often runs alongside these.
const MAX_TOKEN_PRICE_LOOKUPS_PER_CALL = 3;

const CHAIN_PLATFORM_IDS: Record<number, string> = {
  1: 'ethereum',
  8453: 'base',
  42161: 'arbitrum-one',
};

const NATIVE_SYMBOL_TO_COINGECKO_ID: Record<string, string> = {
  ETH: 'ethereum',
  'Sepolia ETH': 'ethereum',
  WETH: 'weth',
};

export type UsdPriceResult = {
  priceMap: Map<string, number>;
  // Keys (same key space as priceMap: lowercased contract address, or the
  // native symbol) whose CoinGecko lookup itself failed — rate-limited,
  // timed out, network error. A key missing from priceMap without being in
  // here means the lookup succeeded and CoinGecko genuinely has no price
  // for it; that distinction matters because CoinGecko's free tier throttles
  // hard (observed: 429s after ~3 rapid calls), so "no price" can otherwise
  // look identical to "unlisted token" when it's really just rate-limited.
  failedKeys: Set<string>;
};

export async function fetchUsdPrices(
  chainId: number,
  transactions: NormalizedTransaction[],
): Promise<UsdPriceResult> {
  const platformId = CHAIN_PLATFORM_IDS[chainId];

  const priceMap = new Map<string, number>();
  const failedKeys = new Set<string>();
  const nativeSymbols = new Set<string>();
  const contractAddresses = new Set<string>();

  for (const tx of transactions) {
    if (tx.type !== 'sent' && tx.type !== 'received') continue;
    if (tx.tokenContractAddress) {
      contractAddresses.add(tx.tokenContractAddress.toLowerCase());
    } else if (NATIVE_SYMBOL_TO_COINGECKO_ID[tx.asset]) {
      nativeSymbols.add(tx.asset);
    }
  }

  const uncachedNativeSymbols = new Set<string>();
  for (const symbol of nativeSymbols) {
    const cached = priceCache.get(`native:${NATIVE_SYMBOL_TO_COINGECKO_ID[symbol]}`);
    if (cached !== undefined) {
      priceMap.set(symbol, cached);
    } else {
      uncachedNativeSymbols.add(symbol);
    }
  }

  const uncachedContractAddresses = new Set<string>();
  for (const address of contractAddresses) {
    const cached = priceCache.get(`token:${platformId}:${address}`);
    if (cached !== undefined) {
      priceMap.set(address, cached);
    } else {
      uncachedContractAddresses.add(address);
    }
  }

  const fetches: Promise<void>[] = [];

  if (uncachedNativeSymbols.size > 0) {
    const ids = [...uncachedNativeSymbols]
      .map((s) => NATIVE_SYMBOL_TO_COINGECKO_ID[s])
      .join(',');

    fetches.push(
      fetchWithTimeout(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
        5000,
      )
        .then(async (res) => {
          if (!res.ok) {
            for (const symbol of uncachedNativeSymbols) failedKeys.add(symbol);
            return;
          }
          const data = (await res.json()) as Record<string, { usd?: number }>;
          for (const symbol of uncachedNativeSymbols) {
            const coingeckoId = NATIVE_SYMBOL_TO_COINGECKO_ID[symbol];
            const price = data[coingeckoId]?.usd;
            if (price !== undefined) {
              priceMap.set(symbol, price);
              priceCache.set(`native:${coingeckoId}`, price);
            }
          }
        })
        .catch(() => {
          for (const symbol of uncachedNativeSymbols) failedKeys.add(symbol);
        }),
    );
  }

  if (platformId && uncachedContractAddresses.size > 0) {
    // CoinGecko's free tier now rejects more than one contract_address per
    // request (400 "exceeds the allowed limit of 1 contract address"), and
    // separately throttles to a handful of calls per short window — so a
    // single batched request for every token in view no longer works at
    // all once a wallet holds more than one unpriced token. Fetch a capped
    // number individually instead; anything beyond the cap is marked the
    // same as a failed lookup (never asked, not "confirmed unlisted") so it
    // doesn't get misread as a spam signal by the unpriced-token flag.
    const addressList = [...uncachedContractAddresses];
    const toFetch = addressList.slice(0, MAX_TOKEN_PRICE_LOOKUPS_PER_CALL);
    const skipped = addressList.slice(MAX_TOKEN_PRICE_LOOKUPS_PER_CALL);

    for (const address of skipped) failedKeys.add(address);

    for (const address of toFetch) {
      fetches.push(
        fetchWithTimeout(
          `https://api.coingecko.com/api/v3/simple/token_price/${platformId}?contract_addresses=${address}&vs_currencies=usd`,
          5000,
        )
          .then(async (res) => {
            if (!res.ok) {
              failedKeys.add(address);
              return;
            }
            const data = (await res.json()) as Record<string, { usd?: number }>;
            const entry = Object.entries(data).find(([key]) => key.toLowerCase() === address);
            const price = entry?.[1]?.usd;
            if (price !== undefined) {
              priceMap.set(address, price);
              priceCache.set(`token:${platformId}:${address}`, price);
            }
          })
          .catch(() => {
            failedKeys.add(address);
          }),
      );
    }
  }

  await Promise.all(fetches);
  return { priceMap, failedKeys };
}

export function formatUsd(value: number): string {
  if (value === 0) return '$0.00';
  if (value < 0.01) return '< $0.01';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}
