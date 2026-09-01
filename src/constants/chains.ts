import { arbitrum, base, mainnet, optimism, sepolia } from 'wagmi/chains';

export const mainnetChains = [mainnet, base, arbitrum, optimism];
export const testnetChains = [sepolia];
export const supportedChains = [...mainnetChains, ...testnetChains];
export type SupportedChainId = (typeof supportedChains)[number]['id'];

export const chainSymbols: Record<number, string> = {
  [mainnet.id]: 'ETH',
  [base.id]: 'ETH',
  [arbitrum.id]: 'ETH',
  [optimism.id]: 'ETH',
  [sepolia.id]: 'ETH',
};

export function getChainSymbol(chainId: number | undefined) {
  if (!chainId) return undefined;
  return chainSymbols[chainId];
}

export function getExplorerTransactionUrl(chainId: number | undefined, hash: string) {
  if (chainId === mainnet.id) return `https://etherscan.io/tx/${hash}`;
  if (chainId === base.id) return `https://basescan.org/tx/${hash}`;
  if (chainId === arbitrum.id) return `https://arbiscan.io/tx/${hash}`;
  if (chainId === optimism.id) return `https://optimistic.etherscan.io/tx/${hash}`;
  if (chainId === sepolia.id) return `https://sepolia.etherscan.io/tx/${hash}`;
  return undefined;
}
