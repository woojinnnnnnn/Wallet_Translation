import type { TransactionTypeFilter } from '../types/activity';

export const typeFilters: Array<{ label: string; value: TransactionTypeFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'In', value: 'received' },
  { label: 'Out', value: 'sent' },
  { label: 'Swap', value: 'swap' },
  { label: 'Approval', value: 'approval' },
  { label: 'Contract', value: 'contract' },
];
