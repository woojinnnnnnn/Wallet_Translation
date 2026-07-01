import { mainnet, polygon, polygonAmoy, sepolia } from 'wagmi/chains';

export const supportedChains = [mainnet, sepolia, polygon, polygonAmoy];
export type SupportedChainId = (typeof supportedChains)[number]['id'];

export const chainSymbols: Record<number, string> = {
  [mainnet.id]: 'ETH',
  [sepolia.id]: 'ETH',
  [polygon.id]: 'POL',
  [polygonAmoy.id]: 'POL',
};

export function getChainSymbol(chainId: number | undefined) {
  if (!chainId) {
    return undefined;
  }

  return chainSymbols[chainId];
}

export function getExplorerTransactionUrl(chainId: number | undefined, hash: string) {
  if (chainId === mainnet.id) {
    return `https://etherscan.io/tx/${hash}`;
  }

  if (chainId === sepolia.id) {
    return `https://sepolia.etherscan.io/tx/${hash}`;
  }

  if (chainId === polygon.id) {
    return `https://polygonscan.com/tx/${hash}`;
  }

  if (chainId === polygonAmoy.id) {
    return `https://amoy.polygonscan.com/tx/${hash}`;
  }

  return undefined;
}
