import { describe, expect, it } from 'vitest';
import type { NormalizedTransaction, TransactionRisk } from '../types/activity';
import type { AddressSecurityFlags, TokenSecurityFlags } from './goplusService';
import {
  applyAddressSecurity,
  applyExecutorRisk,
  applyTokenSecurity,
  applyUsdPrices,
  detectSymbolImpersonation,
  getApprovalKind,
  getDirection,
  getScamOverride,
  getTransferRisk,
  groupTransactions,
  mostSevereRisk,
  normalizeBlockscoutApproval,
  normalizeContractInteraction,
  normalizeNativeTransaction,
  normalizeSymbolForComparison,
  normalizeTokenTransfer,
  type ChainActivityConfig,
} from './activityService';

const OWNER = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';
const SCAM = '0x3333333333333333333333333333333333333333';
const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';

const ETH_CONFIG: ChainActivityConfig = {
  apiBaseUrl: 'https://eth.blockscout.com/api/v2',
  nativeSymbol: 'ETH',
  protectedTokens: {
    USDT: '0xdac17f958d2ee523a2206206994597c13d831ec7',
  },
};

function tx(overrides: Partial<NormalizedTransaction> = {}): NormalizedTransaction {
  return {
    id: 'hash-1',
    type: 'sent',
    from: 'My wallet',
    fromAddress: OWNER,
    to: 'Unknown address',
    toAddress: OTHER,
    asset: 'ETH',
    amount: '1',
    risk: { level: 'low', reason: 'Standard outgoing transfer.' },
    summary: 'ETH left your wallet.',
    timestamp: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('getDirection', () => {
  it('classifies an outgoing transfer as sent', () => {
    expect(getDirection(OWNER, OTHER, OWNER)).toBe('sent');
  });

  it('classifies an incoming transfer as received', () => {
    expect(getDirection(OTHER, OWNER, OWNER)).toBe('received');
  });

  it('classifies a self-to-self record as contract, not a transfer', () => {
    expect(getDirection(OWNER, OWNER, OWNER)).toBe('contract');
  });

  it('drops records that do not involve the owner at all', () => {
    expect(getDirection(OTHER, SCAM, OWNER)).toBeUndefined();
  });

  it('is case-insensitive', () => {
    expect(getDirection(OWNER.toUpperCase(), OTHER, OWNER)).toBe('sent');
  });
});

describe('getScamOverride', () => {
  it('forces high risk when the counterparty is flagged as scam', () => {
    expect(getScamOverride({ hash: SCAM, is_scam: true })).toEqual({
      level: 'high',
      reason: 'This address is flagged as a scam by Blockscout.',
    });
  });

  it('returns undefined when the counterparty is not flagged', () => {
    expect(getScamOverride({ hash: OTHER, is_scam: false })).toBeUndefined();
    expect(getScamOverride({ hash: OTHER })).toBeUndefined();
    expect(getScamOverride(null)).toBeUndefined();
  });

  it('ignores the is_scam flag on the null address (mint/burn sentinel)', () => {
    expect(getScamOverride({ hash: NULL_ADDRESS, is_scam: true })).toBeUndefined();
  });
});

describe('getTransferRisk', () => {
  it('marks sent/received as low risk', () => {
    expect(getTransferRisk('sent').level).toBe('low');
    expect(getTransferRisk('received').level).toBe('low');
  });

  it('marks bare contract interactions as unknown risk', () => {
    expect(getTransferRisk('contract').level).toBe('unknown');
  });
});

describe('getApprovalKind', () => {
  it('flags setApprovalForAll as high risk', () => {
    expect(getApprovalKind('setApprovalForAll')?.risk.level).toBe('high');
  });

  it('flags an unlimited approve() as high risk', () => {
    expect(getApprovalKind('approve', true)?.risk.level).toBe('high');
  });

  it('flags a bounded approve() as medium risk', () => {
    expect(getApprovalKind('approve', false)?.risk.level).toBe('medium');
  });

  it('flags permit() as medium risk', () => {
    expect(getApprovalKind('permit')?.risk.level).toBe('medium');
  });

  it('recognizes increaseAllowance/decreaseAllowance as approvals', () => {
    expect(getApprovalKind('increaseAllowance')?.risk.level).toBe('medium');
    expect(getApprovalKind('decreaseAllowance')?.risk.level).toBe('medium');
  });

  it('returns undefined for a method that is not an approval', () => {
    expect(getApprovalKind('transfer')).toBeUndefined();
    expect(getApprovalKind('')).toBeUndefined();
  });
});

describe('normalizeSymbolForComparison / detectSymbolImpersonation', () => {
  it('matches a plain "ETH" symbol to the native currency', () => {
    expect(normalizeSymbolForComparison('ETH')).toBe('ETH');
    expect(detectSymbolImpersonation('ETH', undefined, ETH_CONFIG)).toEqual({
      impersonatedSymbol: 'ETH',
    });
  });

  it('catches a Greek-Tau lookalike "ETH"', () => {
    // "E" + Greek capital Tau (Τ, U+03A4) + "H" — visually identical to ETH.
    const spoofed = 'EΤH';
    expect(normalizeSymbolForComparison(spoofed)).toBe('ETH');
    expect(detectSymbolImpersonation(spoofed, undefined, ETH_CONFIG)).toEqual({
      impersonatedSymbol: 'ETH',
    });
  });

  it('catches combining marks spliced between letters', () => {
    // "E" + combining char + "T" + combining char + "H"
    const spoofed = 'ÉT́H';
    expect(normalizeSymbolForComparison(spoofed)).toBe('ETH');
  });

  it('catches a precomposed letter+mark that NFKC would otherwise merge', () => {
    // "T" + COMBINING DOT BELOW has a precomposed form (U+1E6C, "Ṭ"); NFKD
    // must split it back apart for the Mn/Me/Cf strip to catch it.
    const spoofed = 'EṬH';
    expect(normalizeSymbolForComparison(spoofed)).toBe('ETH');
  });

  it('does not flag a genuine unrelated symbol', () => {
    expect(detectSymbolImpersonation('USDC', undefined, ETH_CONFIG)).toBeUndefined();
  });

  it('catches a spoofed protected token on the wrong contract address', () => {
    expect(
      detectSymbolImpersonation('USDT', '0xdeadbeef00000000000000000000000000dead', ETH_CONFIG),
    ).toEqual({ impersonatedSymbol: 'USDT' });
  });

  it('does not flag the real protected token contract', () => {
    expect(
      detectSymbolImpersonation(
        'USDT',
        '0xdac17f958d2ee523a2206206994597c13d831ec7',
        ETH_CONFIG,
      ),
    ).toBeUndefined();
  });
});

describe('normalizeTokenTransfer', () => {
  it('forces high risk and relabels the asset when the symbol is impersonated', () => {
    const result = normalizeTokenTransfer(
      {
        from: { hash: OTHER },
        to: { hash: OWNER },
        transaction_hash: 'hash-1',
        token: { symbol: 'EΤH', address_hash: '0xfake' },
        total: { value: '1000000000000000000', decimals: '18' },
      },
      OWNER,
      true,
      ETH_CONFIG,
    );

    expect(result?.risk.level).toBe('high');
    expect(result?.asset).toBe('EΤH (token)');
  });

  it('overrides risk to high when the counterparty is scam-flagged, even over impersonation', () => {
    const result = normalizeTokenTransfer(
      {
        from: { hash: OTHER, is_scam: true },
        to: { hash: OWNER },
        transaction_hash: 'hash-1',
        token: { symbol: 'USDC', address_hash: '0xreal' },
        total: { value: '1000000', decimals: '6' },
      },
      OWNER,
      true,
      ETH_CONFIG,
    );

    expect(result?.risk).toEqual({
      level: 'high',
      reason: 'This address is flagged as a scam by Blockscout.',
    });
  });

  it('drops records that do not involve the owner', () => {
    const result = normalizeTokenTransfer(
      {
        from: { hash: OTHER },
        to: { hash: SCAM },
        transaction_hash: 'hash-1',
        token: { symbol: 'USDC' },
      },
      OWNER,
      true,
      ETH_CONFIG,
    );

    expect(result).toBeUndefined();
  });
});

describe('normalizeNativeTransaction', () => {
  it('drops zero-value calls (handled elsewhere as contract interactions)', () => {
    const result = normalizeNativeTransaction(
      { from: { hash: OWNER }, to: { hash: OTHER }, hash: 'hash-1', value: '0' },
      OWNER,
      'ETH',
      true,
    );

    expect(result).toBeUndefined();
  });

  it('classifies a non-zero outgoing native transfer as sent/low risk', () => {
    const result = normalizeNativeTransaction(
      {
        from: { hash: OWNER },
        to: { hash: OTHER },
        hash: 'hash-1',
        value: '1000000000000000000',
      },
      OWNER,
      'ETH',
      true,
    );

    expect(result?.type).toBe('sent');
    expect(result?.risk.level).toBe('low');
    expect(result?.amount).toBe('1');
  });
});

describe('normalizeContractInteraction', () => {
  it('surfaces a zero-value call from the owner as an opaque contract interaction', () => {
    const result = normalizeContractInteraction(
      { from: { hash: OWNER }, to: { hash: OTHER }, hash: 'hash-1', value: '0' },
      OWNER,
      true,
    );

    expect(result?.type).toBe('contract');
    expect(result?.risk.level).toBe('unknown');
  });

  it('escalates to high risk when the called contract is scam-flagged', () => {
    const result = normalizeContractInteraction(
      { from: { hash: OWNER }, to: { hash: SCAM, is_scam: true }, hash: 'hash-1', value: '0' },
      OWNER,
      true,
    );

    expect(result?.risk.level).toBe('high');
  });

  it('ignores non-zero-value calls (handled by normalizeNativeTransaction instead)', () => {
    const result = normalizeContractInteraction(
      { from: { hash: OWNER }, to: { hash: OTHER }, hash: 'hash-1', value: '1' },
      OWNER,
      true,
    );

    expect(result).toBeUndefined();
  });
});

describe('normalizeBlockscoutApproval', () => {
  it('flags an unlimited approve() as high risk with the real spender', () => {
    const maxUint256 =
      '115792089237316195423570985008687907853269984665640564039457584007913129639935';

    const result = normalizeBlockscoutApproval(
      {
        from: { hash: OWNER },
        to: { hash: OTHER },
        hash: 'hash-1',
        method: 'approve',
        decoded_input: {
          parameters: [
            { name: 'spender', type: 'address', value: SCAM },
            { name: 'amount', type: 'uint256', value: maxUint256 },
          ],
        },
      },
      OWNER,
      true,
    );

    expect(result?.risk.level).toBe('high');
    expect(result?.spenderAddress).toBe(SCAM);
    expect(result?.toAddress).toBe(SCAM);
  });

  it('drops non-approval method calls', () => {
    const result = normalizeBlockscoutApproval(
      { from: { hash: OWNER }, to: { hash: OTHER }, hash: 'hash-1', method: 'transfer' },
      OWNER,
      true,
    );

    expect(result).toBeUndefined();
  });
});

describe('groupTransactions', () => {
  it('lets an approval win over any other record sharing the same hash', () => {
    const approval = tx({ id: 'h1', type: 'approval', risk: { level: 'medium', reason: 'x' } });
    const contract = tx({ id: 'h1', type: 'contract' });

    const [result] = groupTransactions([contract, approval], true);
    expect(result.type).toBe('approval');
  });

  it('collapses a sent + received pair on the same hash into a swap', () => {
    const sent = tx({ id: 'h1', type: 'sent', asset: 'USDC', amount: '100' });
    const received = tx({ id: 'h1', type: 'received', asset: 'ETH', amount: '0.05' });

    const [result] = groupTransactions([sent, received], true);
    expect(result.type).toBe('swap');
    expect(result.movements).toHaveLength(2);
  });

  it('preserves a high-severity risk from one leg instead of defaulting to low on a swap', () => {
    const sent = tx({ id: 'h1', type: 'sent' });
    const received = tx({
      id: 'h1',
      type: 'received',
      risk: { level: 'high', reason: 'scam counterparty' },
    });

    const [result] = groupTransactions([sent, received], true);
    expect(result.risk.level).toBe('high');
  });

  it('groups multiple same-direction movements on one hash without treating it as a swap', () => {
    const a = tx({ id: 'h1', type: 'sent', asset: 'A' });
    const b = tx({ id: 'h1', type: 'sent', asset: 'B' });

    const [result] = groupTransactions([a, b], true);
    expect(result.type).toBe('sent');
    expect(result.movements).toHaveLength(2);
  });

  it('passes a single record through unchanged', () => {
    const single = tx({ id: 'h1' });
    const [result] = groupTransactions([single], true);
    expect(result).toBe(single);
  });
});

describe('mostSevereRisk', () => {
  it('picks the highest-severity risk among several', () => {
    const risks: TransactionRisk[] = [
      { level: 'low', reason: 'a' },
      { level: 'high', reason: 'b' },
      { level: 'medium', reason: 'c' },
    ];
    expect(mostSevereRisk(risks)?.level).toBe('high');
  });

  it('returns undefined for an empty list', () => {
    expect(mostSevereRisk([])).toBeUndefined();
  });
});

describe('applyExecutorRisk', () => {
  it('elevates a sent transfer to high risk when someone else signed it', () => {
    const transactions = [tx({ id: 'h1', type: 'sent' })];
    const [result] = applyExecutorRisk(transactions, new Set(['h1']));

    expect(result.risk.level).toBe('high');
    expect(result.risk.reason).toContain('executed by another address');
  });

  it('also carries the flag onto a swap (transferFrom disguised as one leg of a swap)', () => {
    const transactions = [tx({ id: 'h1', type: 'swap' })];
    const [result] = applyExecutorRisk(transactions, new Set(['h1']));

    expect(result.risk.level).toBe('high');
  });

  it('leaves unrelated hashes and non-sent/swap types untouched', () => {
    const received = tx({ id: 'h1', type: 'received' });
    const otherHash = tx({ id: 'h2', type: 'sent' });

    const [r1, r2] = applyExecutorRisk([received, otherHash], new Set(['h1']));
    expect(r1.risk).toEqual(received.risk);
    expect(r2.risk).toEqual(otherHash.risk);
  });

  it('is a no-op when nothing was flagged', () => {
    const transactions = [tx({ id: 'h1' })];
    expect(applyExecutorRisk(transactions, new Set())).toBe(transactions);
  });
});

describe('applyTokenSecurity', () => {
  const clean: TokenSecurityFlags = {
    isHoneypot: false,
    cannotSell: false,
    hasHighTax: false,
    isClosedSource: false,
  };

  it('escalates to high risk for a honeypot token', () => {
    const transactions = [tx({ tokenContractAddress: '0xtoken' })];
    const flags = new Map([['0xtoken', { ...clean, isHoneypot: true }]]);

    const [result] = applyTokenSecurity(transactions, flags, new Set());
    expect(result.risk.level).toBe('high');
  });

  it('escalates to medium risk for a high-tax token', () => {
    const transactions = [tx({ tokenContractAddress: '0xtoken' })];
    const flags = new Map([['0xtoken', { ...clean, hasHighTax: true }]]);

    const [result] = applyTokenSecurity(transactions, flags, new Set());
    expect(result.risk.level).toBe('medium');
  });

  it('marks riskCheckIncomplete when the lookup failed, without touching the base risk', () => {
    const transactions = [tx({ tokenContractAddress: '0xtoken' })];
    const [result] = applyTokenSecurity(transactions, new Map(), new Set(['0xtoken']));

    expect(result.riskCheckIncomplete).toBe(true);
    expect(result.risk.level).toBe('low');
  });

  it('leaves transactions without a token contract address untouched', () => {
    const transactions = [tx()];
    const flags = new Map([['0xtoken', { ...clean, isHoneypot: true }]]);

    const [result] = applyTokenSecurity(transactions, flags, new Set());
    expect(result.risk.level).toBe('low');
  });
});

describe('applyAddressSecurity', () => {
  it('escalates an approval to high risk when the spender is flagged malicious', () => {
    const transactions = [
      tx({ type: 'approval', spenderAddress: SCAM, risk: { level: 'medium', reason: 'x' } }),
    ];
    const flags = new Map<string, AddressSecurityFlags>([
      [SCAM.toLowerCase(), { isMalicious: true, reasons: ['phishing'] }],
    ]);

    const [result] = applyAddressSecurity(transactions, flags, new Set());
    expect(result.risk.level).toBe('high');
    expect(result.risk.reason).toContain('phishing');
  });

  it('ignores non-approval transactions entirely', () => {
    const transactions = [tx({ type: 'sent' })];
    const flags = new Map<string, AddressSecurityFlags>([
      [OTHER.toLowerCase(), { isMalicious: true, reasons: ['phishing'] }],
    ]);

    const [result] = applyAddressSecurity(transactions, flags, new Set());
    expect(result.risk.level).toBe('low');
  });
});

describe('applyUsdPrices', () => {
  it('fills in amountUsd for a priced asset', () => {
    const transactions = [tx({ tokenContractAddress: '0xtoken', amount: '2' })];
    const priceMap = new Map([['0xtoken', 3]]);

    const [result] = applyUsdPrices(transactions, priceMap, new Set());
    expect(result.amountUsd).toBeDefined();
  });

  it('marks priceCheckFailed instead of silently omitting the price', () => {
    const transactions = [tx({ tokenContractAddress: '0xtoken' })];
    const [result] = applyUsdPrices(transactions, new Map(), new Set(['0xtoken']));

    expect(result.priceCheckFailed).toBe(true);
    expect(result.amountUsd).toBeUndefined();
  });

  it('does not price approval/contract/swap rows', () => {
    const transactions = [tx({ type: 'contract', tokenContractAddress: '0xtoken' })];
    const priceMap = new Map([['0xtoken', 3]]);

    const [result] = applyUsdPrices(transactions, priceMap, new Set());
    expect(result.amountUsd).toBeUndefined();
  });
});
