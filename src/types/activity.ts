export type TransactionType = 'sent' | 'received' | 'approval' | 'swap' | 'contract';

export type NormalizedTransaction = {
  id: string;
  type: TransactionType;
  from: string;
  fromAddress: string;
  to: string;
  toAddress: string;
  asset: string;
  amount: string;
  risk: TransactionRisk;
  summary: string;
  timestamp: string;
  tokenContractAddress?: string;
  spenderAddress?: string;
  amountUsd?: string;
  movements?: TransactionMovement[];
  /**
   * True when a security check for this transaction's token/spender failed
   * or timed out — additive information, NOT an alternative to `risk`.
   * `risk` always reflects whatever was independently determined (e.g. an
   * on-chain `is_scam` flag, or the default for its type); it is never
   * downgraded or left blank just because this is true. Any UI that renders
   * `risk` should also render this flag when true, rather than choosing
   * one or the other — a transaction can legitimately be both "high risk"
   * (from a signal that succeeded) and "check incomplete" (from a signal
   * that didn't).
   */
  riskCheckIncomplete?: boolean;
};

export type TransactionRisk = {
  level: 'low' | 'medium' | 'high' | 'unknown';
  reason: string;
};

export type TransactionMovement = {
  type: Extract<TransactionType, 'sent' | 'received'>;
  asset: string;
  amount: string;
  from: string;
  fromAddress: string;
  to: string;
  toAddress: string;
};

export type ActivityRange = 'latest' | '7d' | '30d' | 'all';
