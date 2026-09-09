import { useState } from 'react';
import { mainnet } from 'wagmi/chains';
import { AddressLookup } from './components/AddressLookup';
import { ActivityControls } from './components/ActivityControls';
import { RiskGuideModal } from './components/RiskGuideModal';
import { SampleDataBanner } from './components/SampleDataBanner';
import { StatusMessages } from './components/StatusMessages';
import { SummaryStrip } from './components/SummaryStrip';
import { TransactionList } from './components/TransactionList';
import { WelcomePanel } from './components/WelcomePanel';
import { WalletHeader } from './components/WalletHeader';
import { getChainSymbol, supportedChains } from './constants/chains';
import { useBookmarks } from './hooks/useBookmarks';
import { useChainHealth } from './hooks/useChainHealth';
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
  const chainHealth = useChainHealth();
  const bookmarks = useBookmarks();
  const wallet = useWalletConnection();
  const [manualAddress, setManualAddress] = useState<string | null>(null);
  const [manualChainId, setManualChainId] = useState<number>(mainnet.id);
  const isManualMode = Boolean(manualAddress);
  const effectiveChain = isManualMode
    ? supportedChains.find((chain) => chain.id === manualChainId)
    : wallet.chain;
  const effectiveIsConnected = isManualMode || wallet.isConnected;
  const isEntryScreen = !effectiveIsConnected;
  const isShowingSampleActivity = !wallet.isConnected && !isManualMode;
  const {
    activityQuery,
    activityRange,
    canLoadMore,
    isActivityUnsupported,
    isFetchingMore,
    loadMore,
    setActivityRange,
    transactions,
  } = useWalletActivity({
    address: isManualMode ? manualAddress! : wallet.address,
    chainId: effectiveChain?.id,
    isConnected: effectiveIsConnected,
    isOwnWallet: !isManualMode,
  });
  const activeChainSymbol = getChainSymbol(effectiveChain?.id);
  // "Load more" only ever appends further activity — the existing list
  // should stay visible while it's in flight, not get replaced by skeletons.
  const isInitialFetching = activityQuery.isFetching && !isFetchingMore;

  function toggleTransaction(transactionId: string) {
    setExpandedTransactionId((currentId) =>
      currentId === transactionId ? null : transactionId,
    );
  }

  function lookUpAddress(address: string) {
    setManualAddress(address);
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
        onDisconnect={wallet.disconnect}
        onOpenRiskGuide={() => setIsRiskGuideOpen(true)}
        onToggleTheme={toggleTheme}
        showWalletControl={!isEntryScreen}
        theme={theme}
      />

      <RiskGuideModal isOpen={isRiskGuideOpen} onClose={() => setIsRiskGuideOpen(false)} />

      {(effectiveIsConnected || wallet.connectError || wallet.switchChainError) && (
        <StatusMessages
          activityError={activityQuery.error as Error | null}
          chain={wallet.chain}
          connectError={wallet.connectError}
          hasInjectedConnector={Boolean(wallet.injectedConnector)}
          isActivityUnsupported={isActivityUnsupported}
          switchChainError={wallet.switchChainError}
        />
      )}

      {isEntryScreen ? (
        <WelcomePanel
          hasInjectedConnector={Boolean(wallet.injectedConnector)}
          isConnecting={wallet.isConnecting}
          onConnect={wallet.connectWallet}
        >
          <AddressLookup
            activeAddress={manualAddress}
            bookmarks={bookmarks.bookmarks}
            isBookmarked={bookmarks.isBookmarked}
            onAddBookmark={bookmarks.addBookmark}
            onClear={() => setManualAddress(null)}
            onLookup={lookUpAddress}
            onRemoveBookmark={bookmarks.removeBookmark}
          />
        </WelcomePanel>
      ) : (
        <>
          <AddressLookup
            activeAddress={manualAddress}
            bookmarks={bookmarks.bookmarks}
            isBookmarked={bookmarks.isBookmarked}
            onAddBookmark={bookmarks.addBookmark}
            onClear={() => setManualAddress(null)}
            onLookup={lookUpAddress}
            onRemoveBookmark={bookmarks.removeBookmark}
          />

        </>
      )}

      {isShowingSampleActivity && <SampleDataBanner />}

      {(effectiveIsConnected || isShowingSampleActivity) && (
        <>
          <SummaryStrip
            isConnected={effectiveIsConnected}
            isFetching={isInitialFetching}
            transactionCount={transactions.length}
          />

          <ActivityControls
            activeChain={effectiveChain}
            activityRange={activityRange}
            chainHealth={chainHealth}
            isConnected={effectiveIsConnected}
            isSwitchingChain={isManualMode ? false : wallet.isSwitchingChain}
            onRangeChange={setActivityRange}
            onSwitchChain={(chainId) =>
              isManualMode ? setManualChainId(chainId) : wallet.switchChain({ chainId })
            }
          />

          <TransactionList
            activeChainSymbol={activeChainSymbol}
            canLoadMore={canLoadMore}
            chain={effectiveChain}
            copiedAddress={copiedAddress}
            copiedTransactionId={copiedTransactionId}
            expandedTransactionId={expandedTransactionId}
            hasError={Boolean(activityQuery.error)}
            isConnected={effectiveIsConnected}
            isFetching={isInitialFetching}
            isFetchingMore={isFetchingMore}
            onCopyAddress={copyAddress}
            onCopyHash={copyTransactionHash}
            onLoadMore={loadMore}
            onToggleTransaction={toggleTransaction}
            transactions={transactions}
          />
        </>
      )}

      <footer className="app-footer">
        Risk levels are an automated heuristic, not a security audit —
        verify anything flagged before you act on it.
      </footer>
    </main>
  );
}

export default App;
