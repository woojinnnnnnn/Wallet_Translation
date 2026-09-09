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
import { injected, walletConnect } from 'wagmi/connectors';

// Public, non-secret identifier — safe to expose in a client bundle (it's
// how WalletConnect's relay tells requests apart per app, not an API key).
// Optional at the type level so a checkout/build missing the env var still
// produces a working app (injected-only) instead of crashing.
const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as
  | string
  | undefined;

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
    // Covers mobile wallets with no browser extension (Trust Wallet,
    // Rainbow, etc.) via a QR-code / deep-link handoff. Only registered
    // when a project ID is configured, so a build without one still works
    // with the injected connector alone rather than throwing at connect time.
    ...(walletConnectProjectId
      ? [
          walletConnect({
            projectId: walletConnectProjectId,
            metadata: {
              name: 'Wallet Transaction Viewer',
              description:
                'A transaction viewer that translates wallet activity into plain language and flags risk signals.',
              url: window.location.origin,
              icons: [`${window.location.origin}/favicon-dark.png`],
            },
          }),
        ]
      : []),
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
