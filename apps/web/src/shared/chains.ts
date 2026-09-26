import { defineChain } from "viem";
import { base } from "viem/chains";

export const robinhood = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: {
    default: {
      name: "Robinhood Explorer",
      url: "https://robinhoodchain.blockscout.com",
    },
  },
});
export const walletChains = [robinhood, base] as const;
export type WalletChainId = 4663 | 8453;
export function walletChain(chainId: WalletChainId) {
  return chainId === 4663 ? robinhood : base;
}
