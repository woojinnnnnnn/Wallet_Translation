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
  movements?: TransactionMovement[];
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

export type ActivityRange = 'latest' | '7d' | '30d';
