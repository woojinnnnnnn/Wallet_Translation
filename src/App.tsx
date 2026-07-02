import { useState } from 'react';
import { mainnet } from 'wagmi/chains';
import { AddressLookup } from './components/AddressLookup';
import { ActivityControls } from './components/ActivityControls';
import { RiskGuideModal } from './components/RiskGuideModal';
import { StatusMessages } from './components/StatusMessages';
import { SummaryStrip } from './components/SummaryStrip';
import { TransactionList } from './components/TransactionList';
import { WalletHeader } from './components/WalletHeader';
import { getChainSymbol, supportedChains } from './constants/chains';
import { useTheme } from './hooks/useTheme';
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
  const [isRiskGuideOpen, setIsRiskGuideOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const wallet = useWalletConnection();
  const [manualAddress, setManualAddress] = useState<string | null>(null);
  const [manualChainId, setManualChainId] = useState<number>(mainnet.id);
  const isManualMode = Boolean(manualAddress);
  const effectiveChain = isManualMode
    ? supportedChains.find((chain) => chain.id === manualChainId)
    : wallet.chain;
  const effectiveIsConnected = isManualMode || wallet.isConnected;
  const {
    activityQuery,
    activityRange,
    isActivityUnsupported,
    setActivityRange,
    transactions,
  } = useWalletActivity({
    address: isManualMode ? manualAddress! : wallet.address,
    chainId: effectiveChain?.id,
    isConnected: effectiveIsConnected,
    isOwnWallet: !isManualMode,
  });
  const activeChainSymbol = getChainSymbol(effectiveChain?.id);

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
        onOpenRiskGuide={() => setIsRiskGuideOpen(true)}
        onToggleTheme={toggleTheme}
        theme={theme}
      />

      <RiskGuideModal isOpen={isRiskGuideOpen} onClose={() => setIsRiskGuideOpen(false)} />

      <StatusMessages
        activityError={activityQuery.error as Error | null}
        chain={wallet.chain}
        connectError={wallet.connectError}
        hasInjectedConnector={Boolean(wallet.injectedConnector)}
        isActivityUnsupported={isActivityUnsupported}
        switchChainError={wallet.switchChainError}
      />

      <AddressLookup
        activeAddress={manualAddress}
        onClear={() => setManualAddress(null)}
        onLookup={setManualAddress}
      />

      <SummaryStrip
        isConnected={effectiveIsConnected}
        isFetching={activityQuery.isFetching}
        transactionCount={transactions.length}
      />

      <ActivityControls
        activeChain={effectiveChain}
        activityRange={activityRange}
        isConnected={effectiveIsConnected}
        isSwitchingChain={isManualMode ? false : wallet.isSwitchingChain}
        onRangeChange={setActivityRange}
        onSwitchChain={(chainId) =>
          isManualMode ? setManualChainId(chainId) : wallet.switchChain({ chainId })
        }
      />

      <TransactionList
        activeChainSymbol={activeChainSymbol}
        chain={effectiveChain}
        copiedAddress={copiedAddress}
        copiedTransactionId={copiedTransactionId}
        expandedTransactionId={expandedTransactionId}
        isConnected={effectiveIsConnected}
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
