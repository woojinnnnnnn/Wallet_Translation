import type { Chain } from 'viem';
import { getExplorerTransactionUrl } from '../constants/chains';
import type { NormalizedTransaction } from '../types/activity';
import { formatTimestamp, shortenAddress } from '../utils/format';
import { getActionLabel, getTypeMeta } from '../utils/transactionDisplay';

export function TransactionCard({
  activeChainSymbol,
  chain,
  copiedAddress,
  copiedTransactionId,
  isConnected,
  isExpanded,
  onCopyAddress,
  onCopyHash,
  onToggle,
  transaction,
}: {
  activeChainSymbol?: string;
  chain?: Chain;
  copiedAddress: string | null;
  copiedTransactionId: string | null;
  isConnected: boolean;
  isExpanded: boolean;
  onCopyAddress: (address: string) => void;
  onCopyHash: (hash: string) => void;
  onToggle: (transactionId: string) => void;
  transaction: NormalizedTransaction;
}) {
  const isCopied = copiedTransactionId === transaction.id;
  const typeMeta = getTypeMeta(transaction.type);
  const explorerUrl = getExplorerTransactionUrl(chain?.id, transaction.id);

  return (
    <article className={isExpanded ? 'transaction-card transaction-card-expanded' : 'transaction-card'}>
      <button className="transaction-summary-button" type="button" onClick={() => onToggle(transaction.id)} aria-expanded={isExpanded}>
        <div className={`type-icon type-${typeMeta.tone}`}>{typeMeta.icon}</div>
        <div className="transaction-main">
            <div className="transaction-topline">
            <span className={`type-pill type-pill-${typeMeta.tone}`}>
              {typeMeta.label}
            </span>
            <span className={`risk-pill risk-${transaction.risk.level}`}>
              {transaction.risk.level} risk
            </span>
            <span>{formatTimestamp(transaction.timestamp)}</span>
            <code>{shortenAddress(transaction.id)}</code>
          </div>
          <h2>{getActionLabel(transaction)}</h2>
          <p>{transaction.summary}</p>
          <div className="route-line">
            <span title={transaction.fromAddress}>{transaction.from}</span>
            <span className="route-arrow">to</span>
            <span title={transaction.toAddress}>{transaction.to}</span>
          </div>
        </div>
        <div className={`amount-block amount-${typeMeta.tone}`}>
          <strong>{transaction.amount}</strong>
          <span className="asset-symbol">{transaction.asset}</span>
        </div>
        <span className="expand-indicator">
          {isExpanded ? 'Hide details' : 'Details'}
        </span>
      </button>

      {isExpanded && (
        <>
          <div className="transaction-details">
            <div className="detail-cell detail-cell-hash">
              <span>Transaction hash</span>
              <button
                className="hash-copy-button"
                type="button"
                onClick={() => onCopyHash(transaction.id)}
                title={transaction.id}
              >
                <code>{shortenAddress(transaction.id)}</code>
                <small>{isCopied ? 'Copied' : 'Copy'}</small>
              </button>
            </div>
            <div>
              <span>Network</span>
              <strong className="network-detail">
                {isConnected ? (chain?.name ?? 'Unknown') : 'Sample'}
                {activeChainSymbol && (
                  <span className="symbol-mini">{activeChainSymbol}</span>
                )}
              </strong>
            </div>
            <div>
              <span>Type</span>
              <strong className={`detail-type type-pill type-pill-${typeMeta.tone}`}>
                {typeMeta.label}
              </strong>
            </div>
            <div>
              <span>Risk</span>
              <strong className={`detail-risk risk-pill risk-${transaction.risk.level}`}>
                {transaction.risk.level}
              </strong>
            </div>
            <div>
              <span>Asset</span>
              <strong className="asset-detail">{transaction.asset}</strong>
            </div>
            <div>
              <span>Amount</span>
              <strong>{transaction.amount}</strong>
            </div>
            <div>
              <span>Time</span>
              <strong>{formatTimestamp(transaction.timestamp)}</strong>
            </div>
            <div>
              <span>From</span>
              <button
                className="address-copy-button"
                type="button"
                onClick={() => onCopyAddress(transaction.fromAddress)}
                title={transaction.fromAddress}
              >
                <strong>{transaction.from}</strong>
                <small>
                  {copiedAddress === transaction.fromAddress ? 'Copied' : 'Copy'}
                </small>
              </button>
            </div>
            <div>
              <span>To</span>
              <button
                className="address-copy-button"
                type="button"
                onClick={() => onCopyAddress(transaction.toAddress)}
                title={transaction.toAddress}
              >
                <strong>{transaction.to}</strong>
                <small>
                  {copiedAddress === transaction.toAddress ? 'Copied' : 'Copy'}
                </small>
              </button>
            </div>
            <div>
              <span>Risk reason</span>
              <strong>{transaction.risk.reason}</strong>
            </div>
          </div>
          <div className="transaction-actions">
            {transaction.movements && transaction.movements.length > 1 && (
              <div className="movement-list" aria-label="transaction movements">
                <span>Movements</span>
                <div>
                  {transaction.movements.map((movement, index) => (
                    <p key={`${movement.type}-${movement.asset}-${index}`}>
                      <strong>{movement.type === 'sent' ? 'Out' : 'In'}</strong>
                      {movement.amount} {movement.asset}
                    </p>
                  ))}
                </div>
              </div>
            )}
            {explorerUrl ? (
              <a
                className="explorer-link"
                href={explorerUrl}
                rel="noreferrer"
                target="_blank"
              >
                View transaction on explorer
              </a>
            ) : (
              <span>Explorer link unavailable</span>
            )}
          </div>
        </>
      )}
    </article>
  );
}
