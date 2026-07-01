import { useState } from 'react';
import { ActivityControls } from './components/ActivityControls';
import { StatusMessages } from './components/StatusMessages';
import { SummaryStrip } from './components/SummaryStrip';
import { TransactionList } from './components/TransactionList';
import { WalletHeader } from './components/WalletHeader';
import { getChainSymbol } from './constants/chains';
import { useWalletActivity } from './hooks/useWalletActivity';
import { useWalletConnection } from './hooks/useWalletConnection';

function App() {
  const [expandedTransactionId, setExpandedTransactionId] = useState<string | null>(
    null,
  );
  const [copiedTransactionId, setCopiedTransactionId] = useState<string | null>(
    null,
  );
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const wallet = useWalletConnection();
  const {
    activityQuery,
    activityRange,
    isActivityUnsupported,
    setActivityRange,
    transactions,
  } = useWalletActivity({
    address: wallet.address,
    chainId: wallet.chain?.id,
    isConnected: wallet.isConnected,
  });
  const activeChainSymbol = getChainSymbol(wallet.chain?.id);

  function toggleTransaction(transactionId: string) {
    setExpandedTransactionId((currentId) =>
      currentId === transactionId ? null : transactionId,
    );
  }

  async function copyTransactionHash(transactionId: string) {
    await navigator.clipboard.writeText(transactionId);
    setCopiedTransactionId(transactionId);
    window.setTimeout(() => setCopiedTransactionId(null), 1400);
  }

  async function copyAddress(addressToCopy: string) {
    if (!addressToCopy) {
      return;
    }

    await navigator.clipboard.writeText(addressToCopy);
    setCopiedAddress(addressToCopy);
    window.setTimeout(() => setCopiedAddress(null), 1400);
  }

  return (
    <main className="app-shell">
      <WalletHeader
        activeChainSymbol={activeChainSymbol}
        chain={wallet.chain}
        connectedLabel={wallet.connectedLabel}
        hasInjectedConnector={Boolean(wallet.injectedConnector)}
        isConnected={wallet.isConnected}
        isConnecting={wallet.isConnecting}
        onConnect={wallet.connectWallet}
        onDisconnect={() => wallet.disconnect()}
      />

      <StatusMessages
        activityError={activityQuery.error as Error | null}
        chain={wallet.chain}
        connectError={wallet.connectError}
        hasInjectedConnector={Boolean(wallet.injectedConnector)}
        isActivityUnsupported={isActivityUnsupported}
        switchChainError={wallet.switchChainError}
      />

      <SummaryStrip
        isConnected={wallet.isConnected}
        isFetching={activityQuery.isFetching}
        transactionCount={transactions.length}
      />

      <ActivityControls
        activeChain={wallet.chain}
        activityRange={activityRange}
        isConnected={wallet.isConnected}
        isSwitchingChain={wallet.isSwitchingChain}
        onRangeChange={setActivityRange}
        onSwitchChain={(chainId) => wallet.switchChain({ chainId })}
      />

      <TransactionList
        activeChainSymbol={activeChainSymbol}
        chain={wallet.chain}
        copiedAddress={copiedAddress}
        copiedTransactionId={copiedTransactionId}
        expandedTransactionId={expandedTransactionId}
        isConnected={wallet.isConnected}
        isFetching={activityQuery.isFetching}
        onCopyAddress={copyAddress}
        onCopyHash={copyTransactionHash}
        onToggleTransaction={toggleTransaction}
        transactions={transactions}
      />
    </main>
  );
}

export default App;
