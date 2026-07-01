const GOPLUS_SUPPORTED_CHAINS: Record<number, string> = {
  1: '1',
  137: '137',
};

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

export async function fetchTokenSecurity(
  chainId: number,
  contractAddresses: string[],
): Promise<Map<string, TokenSecurityFlags>> {
  const goplusChainId = GOPLUS_SUPPORTED_CHAINS[chainId];

  if (!goplusChainId || contractAddresses.length === 0) {
    return new Map();
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 4000);

  try {
    const addresses = contractAddresses.map((a) => a.toLowerCase()).join(',');
    const response = await fetch(
      `https://api.gopluslabs.io/api/v1/token_security/${goplusChainId}?contract_addresses=${addresses}`,
      { signal: controller.signal },
    );

    if (!response.ok) return new Map();

    const data = (await response.json()) as GoPlusResponse;

    if (data.code !== 1 || !data.result) return new Map();

    const result = new Map<string, TokenSecurityFlags>();

    for (const [address, flags] of Object.entries(data.result)) {
      result.set(address.toLowerCase(), {
        isHoneypot: flags.is_honeypot === '1',
        isBlacklisted: flags.is_blacklisted === '1',
        cannotSell: flags.cannot_sell_all === '1',
        hasHighTax:
          Number(flags.sell_tax ?? '0') > 0.1 ||
          Number(flags.buy_tax ?? '0') > 0.1,
        isClosedSource: flags.is_open_source === '0',
      });
    }

    return result;
  } catch {
    return new Map();
  } finally {
    window.clearTimeout(timeoutId);
  }
}
