import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { TtlCache } from '../utils/ttlCache';

const GOPLUS_SUPPORTED_CHAINS: Record<number, string> = {
  1: '1',
  8453: '8453',
  42161: '42161',
};

const SECURITY_CACHE_TTL_MS = 15 * 60_000;

type GoPlusTokenFlags = {
  is_honeypot?: string;
  is_blacklisted?: string;
  cannot_sell_all?: string;
  buy_tax?: string;
  sell_tax?: string;
  is_open_source?: string;
};

type GoPlusResponse = {
  code: number;
  result: Record<string, GoPlusTokenFlags>;
};

export type TokenSecurityFlags = {
  isHoneypot: boolean;
  isBlacklisted: boolean;
  cannotSell: boolean;
  hasHighTax: boolean;
  isClosedSource: boolean;
};

type GoPlusAddressSecurityFlags = {
  cybercrime?: string;
  money_laundering?: string;
  financial_crime?: string;
  darkweb_transactions?: string;
  phishing_activities?: string;
  blackmail_activities?: string;
  stealing_attack?: string;
  fake_kyc?: string;
  blacklist_doubt?: string;
  malicious_mining_activities?: string;
  mixer?: string;
  sanctioned?: string;
  honeypot_related_address?: string;
};

type GoPlusAddressSecurityResponse = {
  code: number;
  result?: GoPlusAddressSecurityFlags;
};

export type AddressSecurityFlags = {
  isMalicious: boolean;
  reasons: string[];
};

export type SecurityLookupResult<T> = {
  flags: Map<string, T>;
  /**
   * Addresses that were actually queried but didn't get a confirmed answer
   * (network error, timeout, non-1 response code) — distinct from addresses
   * that were never queried at all (e.g. GoPlus doesn't cover this chain).
   * Lets callers show "risk check incomplete" instead of implying "checked,
   * no issues found."
   */
  failedAddresses: Set<string>;
};

const addressSecurityCache = new TtlCache<AddressSecurityFlags>(SECURITY_CACHE_TTL_MS);
const tokenSecurityCache = new TtlCache<TokenSecurityFlags>(SECURITY_CACHE_TTL_MS);

const CLEAN_TOKEN_FLAGS: TokenSecurityFlags = {
  isHoneypot: false,
  isBlacklisted: false,
  cannotSell: false,
  hasHighTax: false,
  isClosedSource: false,
};

const ADDRESS_SECURITY_LABELS: Record<keyof GoPlusAddressSecurityFlags, string> = {
  cybercrime: 'linked to cybercrime',
  money_laundering: 'linked to money laundering',
  financial_crime: 'linked to financial crime',
  darkweb_transactions: 'linked to dark web transactions',
  phishing_activities: 'linked to phishing activity',
  blackmail_activities: 'linked to blackmail activity',
  stealing_attack: 'linked to theft/drainer activity',
  fake_kyc: 'linked to fake KYC activity',
  blacklist_doubt: 'flagged as a suspected blacklisted address',
  malicious_mining_activities: 'linked to malicious mining activity',
  mixer: 'a known mixer/tumbler address',
  sanctioned: 'a sanctioned address',
  honeypot_related_address: 'linked to honeypot scams',
};

/**
 * GoPlus address_security has no batch endpoint, so each address is fetched
 * individually; each request carries its own timeout so one slow lookup
 * can't block the rest.
 */
export async function fetchAddressSecurity(
  addresses: string[],
): Promise<SecurityLookupResult<AddressSecurityFlags>> {
  const uniqueAddresses = [...new Set(addresses.map((a) => a.toLowerCase()))];
  const flags = new Map<string, AddressSecurityFlags>();
  const failedAddresses = new Set<string>();

  if (uniqueAddresses.length === 0) {
    return { flags, failedAddresses };
  }

  const uncachedAddresses: string[] = [];
  for (const address of uniqueAddresses) {
    const cached = addressSecurityCache.get(address);
    if (cached) {
      flags.set(address, cached);
    } else {
      uncachedAddresses.push(address);
    }
  }

  await Promise.all(
    uncachedAddresses.map(async (address) => {
      try {
        const response = await fetchWithTimeout(
          `https://api.gopluslabs.io/api/v1/address_security/${address}`,
        );

        if (!response.ok) {
          failedAddresses.add(address);
          return;
        }

        const data = (await response.json()) as GoPlusAddressSecurityResponse;
        if (data.code !== 1 || !data.result) {
          failedAddresses.add(address);
          return;
        }

        const reasons = (
          Object.keys(ADDRESS_SECURITY_LABELS) as Array<keyof GoPlusAddressSecurityFlags>
        )
          .filter((key) => data.result?.[key] === '1')
          .map((key) => ADDRESS_SECURITY_LABELS[key]);

        // Cache the confirmed outcome either way (clean or malicious) so a
        // repeat lookup for this address doesn't re-hit GoPlus within the TTL.
        const resolved: AddressSecurityFlags = { isMalicious: reasons.length > 0, reasons };
        addressSecurityCache.set(address, resolved);
        flags.set(address, resolved);
      } catch {
        // timeout/network error — don't cache it, so it's retried on the
        // next fetch instead of being stuck "unknown" for the full TTL
        failedAddresses.add(address);
      }
    }),
  );

  return { flags, failedAddresses };
}

export async function fetchTokenSecurity(
  chainId: number,
  contractAddresses: string[],
): Promise<SecurityLookupResult<TokenSecurityFlags>> {
  const goplusChainId = GOPLUS_SUPPORTED_CHAINS[chainId];
  const flags = new Map<string, TokenSecurityFlags>();
  const failedAddresses = new Set<string>();

  if (!goplusChainId || contractAddresses.length === 0) {
    return { flags, failedAddresses };
  }

  const uniqueAddresses = [...new Set(contractAddresses.map((a) => a.toLowerCase()))];
  const uncachedAddresses: string[] = [];

  for (const address of uniqueAddresses) {
    const cached = tokenSecurityCache.get(`${goplusChainId}:${address}`);
    if (cached) {
      flags.set(address, cached);
    } else {
      uncachedAddresses.push(address);
    }
  }

  if (uncachedAddresses.length === 0) {
    return { flags, failedAddresses };
  }

  try {
    const response = await fetchWithTimeout(
      `https://api.gopluslabs.io/api/v1/token_security/${goplusChainId}?contract_addresses=${uncachedAddresses.join(',')}`,
    );

    if (!response.ok) {
      uncachedAddresses.forEach((address) => failedAddresses.add(address));
      return { flags, failedAddresses };
    }

    const data = (await response.json()) as GoPlusResponse;

    if (data.code !== 1 || !data.result) {
      uncachedAddresses.forEach((address) => failedAddresses.add(address));
      return { flags, failedAddresses };
    }

    const flagsByAddress = new Map<string, GoPlusTokenFlags>();
    for (const [address, rawFlags] of Object.entries(data.result)) {
      flagsByAddress.set(address.toLowerCase(), rawFlags);
    }

    // Cache every address we just checked, including ones GoPlus had no
    // flags for — that's a confirmed "clean" result, not "unknown," so it
    // shouldn't be re-queried again within the TTL either.
    for (const address of uncachedAddresses) {
      const rawFlags = flagsByAddress.get(address);
      const parsed: TokenSecurityFlags = rawFlags
        ? {
            isHoneypot: rawFlags.is_honeypot === '1',
            isBlacklisted: rawFlags.is_blacklisted === '1',
            cannotSell: rawFlags.cannot_sell_all === '1',
            hasHighTax:
              Number(rawFlags.sell_tax ?? '0') > 0.1 ||
              Number(rawFlags.buy_tax ?? '0') > 0.1,
            isClosedSource: rawFlags.is_open_source === '0',
          }
        : CLEAN_TOKEN_FLAGS;

      tokenSecurityCache.set(`${goplusChainId}:${address}`, parsed);
      flags.set(address, parsed);
    }

    return { flags, failedAddresses };
  } catch {
    // timeout/network error — don't cache, so these get retried next fetch
    uncachedAddresses.forEach((address) => failedAddresses.add(address));
    return { flags, failedAddresses };
  }
}
