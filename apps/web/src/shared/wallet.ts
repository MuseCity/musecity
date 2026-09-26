import {
  encodeFunctionData,
  erc20Abi,
  isAddress,
  parseUnits,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import type { WalletChainId } from "./chains";

export type WalletAsset = {
  address: Address | null;
  symbol: string;
  decimals: number;
  balance: string;
};
export type Transfer = {
  chainId: WalletChainId;
  asset: WalletAsset;
  recipient: string;
  amount: string;
};
export type TransactionStatus = "pending" | "confirmed" | "reverted";
export type WalletSession = {
  address: string;
  switchChain: (chainId: WalletChainId) => Promise<void>;
  assets: (chainId: WalletChainId, token?: string) => Promise<WalletAsset[]>;
  send: (transfer: Transfer) => Promise<Hex>;
  status: (chainId: WalletChainId, hash: Hex) => Promise<TransactionStatus>;
};
export function transferRequest(transfer: Transfer) {
  const { recipient, amount, asset, chainId } = transfer;
  if (chainId !== 4663 && chainId !== 8453)
    throw new Error("Choose a supported network.");
  if (!isAddress(recipient) || recipient.toLowerCase() === zeroAddress)
    throw new Error("Enter a valid non-zero recipient address.");
  if (
    !Number.isInteger(asset.decimals) ||
    asset.decimals < 0 ||
    asset.decimals > 255
  )
    throw new Error("Invalid token decimals.");
  if (
    !/^(0|[1-9]\d*)(\.\d+)?$/.test(amount) ||
    (amount.split(".")[1]?.length ?? 0) > asset.decimals
  )
    throw new Error(
      "Enter a positive amount within this asset's decimal precision.",
    );
  const value = parseUnits(amount, asset.decimals);
  if (value <= 0n || value >= 2n ** 256n)
    throw new Error("Enter a valid positive amount.");
  if (value > BigInt(asset.balance))
    throw new Error("Insufficient asset balance.");
  if (
    asset.address &&
    (!isAddress(asset.address) || asset.address.toLowerCase() === zeroAddress)
  )
    throw new Error("Invalid token contract.");
  return {
    chainId,
    to: asset.address ?? (recipient as Address),
    value: asset.address ? 0n : value,
    ...(asset.address
      ? {
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "transfer",
            args: [recipient as Address, value],
          }),
        }
      : {}),
  };
}
export function walletError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Wallet operation failed.";
  if (/reject|denied|cancelled|canceled|4001/i.test(message))
    return "You cancelled the wallet request. No transfer was submitted by this action.";
  if (/insufficient.*fund|exceeds.*balance/i.test(message))
    return "Insufficient balance. Keep enough ETH on this network for the transaction fee.";
  return message.length > 300
    ? "The wallet or network could not complete this request. Check your wallet activity before submitting again."
    : message;
}
