import { createConfig, http } from 'wagmi';
import { mainnet, polygon, polygonAmoy, sepolia } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

export const wagmiConfig = createConfig({
  chains: [mainnet, sepolia, polygon, polygonAmoy],
  connectors: [
    injected({
      target: 'metaMask',
    }),
    injected(),
  ],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
    [polygon.id]: http(),
    [polygonAmoy.id]: http(),
  },
});

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}
