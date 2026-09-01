import { createConfig, http } from 'wagmi';
import { arbitrum, base, mainnet, optimism, sepolia } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

export const wagmiConfig = createConfig({
  chains: [mainnet, base, arbitrum, optimism, sepolia],
  connectors: [
    injected({
      target: 'metaMask',
    }),
  ],
  transports: {
    [mainnet.id]: http(),
    [base.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
    [sepolia.id]: http(),
  },
});

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}
