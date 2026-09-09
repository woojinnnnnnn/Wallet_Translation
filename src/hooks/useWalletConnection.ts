import { useMemo } from 'react';
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { shortenAddress } from '../utils/format';

export function useWalletConnection() {
  const { address, chain, isConnected } = useAccount();
  const {
    connect,
    connectors,
    error: connectError,
    isPending: isConnecting,
  } = useConnect();
  const { disconnect } = useDisconnect();
  const {
    switchChain,
    error: switchChainError,
    isPending: isSwitchingChain,
  } = useSwitchChain();

  const connectedLabel = useMemo(() => {
    return address ? shortenAddress(address) : 'Connect wallet';
  }, [address]);
  // By .type rather than array index — order-independent, and stays correct
  // if the connector list in wagmi.ts is ever reordered or grows further.
  const injectedConnector = connectors.find((connector) => connector.type === 'injected');
  const walletConnectConnector = connectors.find(
    (connector) => connector.type === 'walletConnect',
  );

  function connectWallet() {
    if (!injectedConnector) {
      return;
    }

    connect({ connector: injectedConnector });
  }

  function connectWalletConnect() {
    if (!walletConnectConnector) {
      return;
    }

    connect({ connector: walletConnectConnector });
  }

  return {
    address,
    chain,
    connectError,
    connectedLabel,
    connectWallet,
    connectWalletConnect,
    disconnect,
    injectedConnector,
    isConnected,
    isConnecting,
    isSwitchingChain,
    switchChain,
    switchChainError,
    walletConnectConnector,
  };
}
