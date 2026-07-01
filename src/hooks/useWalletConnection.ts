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
  const injectedConnector = connectors[0];

  function connectWallet() {
    if (!injectedConnector) {
      return;
    }

    connect({ connector: injectedConnector });
  }

  return {
    address,
    chain,
    connectError,
    connectedLabel,
    connectWallet,
    disconnect,
    injectedConnector,
    isConnected,
    isConnecting,
    isSwitchingChain,
    switchChain,
    switchChainError,
  };
}
