import type { NormalizedTransaction, TransactionType } from '../types/activity';

export function getActionLabel(transaction: NormalizedTransaction) {
  if (transaction.type === 'sent') {
    return `Sent ${transaction.asset}`;
  }

  if (transaction.type === 'received') {
    return `Received ${transaction.asset}`;
  }

  if (transaction.type === 'approval') {
    return `Approved ${transaction.asset}`;
  }

  if (transaction.type === 'swap') {
    return `Swapped ${transaction.asset}`;
  }

  return `Used ${transaction.asset}`;
}

export function getTypeMeta(type: TransactionType) {
  if (type === 'sent') {
    return { icon: 'OUT', label: 'Sent', tone: 'sent' };
  }

  if (type === 'received') {
    return { icon: 'IN', label: 'Received', tone: 'received' };
  }

  if (type === 'approval') {
    return { icon: 'OK', label: 'Approval', tone: 'approval' };
  }

  if (type === 'swap') {
    return { icon: 'SW', label: 'Swap', tone: 'swap' };
  }

  return { icon: 'CT', label: 'Contract', tone: 'contract' };
}
