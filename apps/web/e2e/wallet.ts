// Deterministic simulation, imported only by the isolated local browser fixture.
import { governanceRules } from "../src/shared/governance";
import {
  transferRequest,
  type Transfer,
  type WalletSession,
} from "../src/shared/wallet";
import { isAddress, type Address, type Hex } from "viem";
export const fixtureAddresses: Record<string, Address> = {
  alice: "0x1111111111111111111111111111111111111111",
  bob: "0x2222222222222222222222222222222222222222",
};
export type WalletScenario = {
  balance: "normal" | "zero" | "default-error" | "custom-error";
  receipt: "pending" | "confirmed" | "reverted" | "error";
  connection: "ready" | "preparing" | "missing" | "unavailable";
  uncertain: boolean;
  networkError: boolean;
  membershipError: boolean;
};
export const defaultScenario: WalletScenario = {
  balance: "normal",
  receipt: "confirmed",
  connection: "ready",
  uncertain: false,
  networkError: false,
  membershipError: false,
};
export function fixtureWallet(
  user: string,
  scenario: () => WalletScenario = () => defaultScenario,
  approve?: (transfer: Transfer) => Promise<void>,
): WalletSession {
  const wallet: WalletSession = {
    address: fixtureAddresses[user]!,
    switchChain: async () => {
      if (scenario().networkError)
        throw new Error("Local simulated network switch failed.");
    },
    assets: async (chain, token) => {
      const mode = scenario().balance;
      if (
        (!token && mode === "default-error") ||
        (token && mode === "custom-error")
      )
        throw new Error("Local simulated balance lookup unavailable.");
      if (token && !isAddress(token))
        throw new Error("Invalid token contract.");
      return [
        {
          address: null,
          symbol: "ETH",
          decimals: 18,
          balance: mode === "zero" ? "0" : "500000000000000001",
        },
        ...(chain === 4663 || token
          ? [
              {
                address: (token || governanceRules.tokenAddress) as Address,
                symbol:
                  !token ||
                  token.toLowerCase() ===
                    governanceRules.tokenAddress.toLowerCase()
                    ? "MUSEGOD"
                    : "TEST",
                decimals: 18,
                balance:
                  mode === "zero"
                    ? "0"
                    : token &&
                        token.toLowerCase() !==
                          governanceRules.tokenAddress.toLowerCase()
                      ? "123456789012345678901234567890123456789"
                      : user === "alice"
                        ? governanceRules.threshold
                        : "0",
              },
            ]
          : []),
      ];
    },
    send: async (transfer) => {
      const assets = await wallet.assets(
        transfer.chainId,
        transfer.asset.address ?? undefined,
      );
      const current = assets.find(
        (asset) =>
          asset.address?.toLowerCase() ===
          transfer.asset.address?.toLowerCase(),
      );
      if (!current) throw new Error("This asset is unavailable.");
      transferRequest({ ...transfer, asset: current });
      if (document.querySelector("dialog[open]"))
        throw new Error(
          "The app dialog must close before wallet confirmation.",
        );
      if (approve) await approve(transfer);
      else if (
        !window.confirm(
          "LOCAL SIMULATION ONLY: approve this fixture transfer? No real funds or signatures.",
        )
      )
        throw new Error("User rejected request");
      if (scenario().uncertain)
        throw new Error(
          "The wallet did not return a transaction hash. Submission is uncertain. Check wallet activity before sending again.",
        );
      return ("0x" +
        crypto.randomUUID().replaceAll("-", "").padEnd(64, "0")) as Hex;
    },
    status: async () => {
      if (scenario().receipt === "error")
        throw new Error("Local simulated receipt lookup failed.");
      return scenario().receipt as "pending" | "confirmed" | "reverted";
    },
  };
  return wallet;
}
