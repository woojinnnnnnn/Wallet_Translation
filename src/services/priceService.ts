import type { NormalizedTransaction } from '../types/activity';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { TtlCache } from '../utils/ttlCache';

const PRICE_CACHE_TTL_MS = 5 * 60_000;
const priceCache = new TtlCache<number>(PRICE_CACHE_TTL_MS);

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

export async function fetchUsdPrices(
  chainId: number,
  transactions: NormalizedTransaction[],
): Promise<Map<string, number>> {
  const platformId = CHAIN_PLATFORM_IDS[chainId];

  const priceMap = new Map<string, number>();
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
          if (!res.ok) return;
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
        .catch(() => {}),
    );
  }

  if (platformId && uncachedContractAddresses.size > 0) {
    const addresses = [...uncachedContractAddresses].join(',');
    fetches.push(
      fetchWithTimeout(
        `https://api.coingecko.com/api/v3/simple/token_price/${platformId}?contract_addresses=${addresses}&vs_currencies=usd`,
        5000,
      )
        .then(async (res) => {
          if (!res.ok) return;
          const data = (await res.json()) as Record<string, { usd?: number }>;
          for (const [address, prices] of Object.entries(data)) {
            if (prices.usd !== undefined) {
              const lowerAddress = address.toLowerCase();
              priceMap.set(lowerAddress, prices.usd);
              priceCache.set(`token:${platformId}:${lowerAddress}`, prices.usd);
            }
          }
        })
        .catch(() => {}),
    );
  }

  await Promise.all(fetches);
  return priceMap;
}

export function formatUsd(value: number): string {
  if (value === 0) return '$0.00';
  if (value < 0.01) return '< $0.01';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}
