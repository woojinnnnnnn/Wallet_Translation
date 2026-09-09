import { createConfig, http } from 'wagmi';
import {
  arbitrum,
  base,
  gnosis,
  gnosisChiado,
  mainnet,
  optimism,
  polygon,
  scroll,
  sepolia,
  zkSync,
  zkSyncSepoliaTestnet,
} from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

export const wagmiConfig = createConfig({
  chains: [
    mainnet,
    base,
    arbitrum,
    optimism,
    polygon,
    gnosis,
    zkSync,
    scroll,
    sepolia,
    gnosisChiado,
    zkSyncSepoliaTestnet,
  ],
  connectors: [
    // No `target` — a pinned target (e.g. 'metaMask') makes wagmi look only
    // for that wallet's specific injected flag, so anything else providing
    // window.ethereum (Rabby, Coinbase Wallet, OKX Wallet, Brave Wallet,
    // etc.) is invisible to connect() even when it's installed and the only
    // wallet in the browser. The bare injected connector picks up whichever
    // provider the browser exposes instead.
    injected(),
  ],
  transports: {
    [mainnet.id]: http(),
    [base.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
    [polygon.id]: http(),
    [gnosis.id]: http(),
    [zkSync.id]: http(),
    [scroll.id]: http(),
    [sepolia.id]: http(),
    [gnosisChiado.id]: http(),
    [zkSyncSepoliaTestnet.id]: http(),
  },
});

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}
