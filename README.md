# Wallet Transaction Viewer

React MVP for translating wallet activity into a simple "from -> to, amount moved" view.

## Run locally

```bash
npm install
npm run dev
```

The first version uses sample transaction data and a direct browser wallet connection through `window.ethereum`. The next step is to plug in an activity API such as Alchemy, Covalent, Moralis, Etherscan, or Polygonscan.
