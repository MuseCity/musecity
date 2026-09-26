// Deterministic wallet simulation, imported only by the local browser fixture.
import { governanceRules } from "../src/shared/governance";
import { transferRequest, type WalletSession } from "../src/shared/wallet";
import type { Address, Hex } from "viem";
export const fixtureAddresses: Record<string, Address> = {
  alice: "0x1111111111111111111111111111111111111111",
  bob: "0x2222222222222222222222222222222222222222",
};
export function fixtureWallet(user: string): WalletSession {
  return {
    address: fixtureAddresses[user]!,
    switchChain: async () => {},
    assets: async (chain, token) => [
      {
        address: null,
        symbol: "ETH",
        decimals: 18,
        balance: "500000000000000000",
      },
      ...(chain === 4663 || token
        ? [
            {
              address: (token || governanceRules.tokenAddress) as Address,
              symbol: "MUSEGOD",
              decimals: 18,
              balance: user === "alice" ? governanceRules.threshold : "0",
            },
          ]
        : []),
    ],
    send: async (transfer) => {
      transferRequest(transfer);
      if (
        !window.confirm(
          "LOCAL SIMULATION ONLY: approve this fixture transfer? No real funds or signatures.",
        )
      )
        throw new Error("User rejected request");
      return ("0x" +
        crypto.randomUUID().replaceAll("-", "").padEnd(64, "0")) as Hex;
    },
    status: async () => "confirmed",
  };
}
