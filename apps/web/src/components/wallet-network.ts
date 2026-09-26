import {
  createPublicClient,
  http,
  erc20Abi,
  isAddress,
  type Address,
  type Hex,
} from "viem";
import { walletChain, type WalletChainId } from "../shared/chains";
import { governanceRules } from "../shared/governance";
import type { ConnectedWallet } from "@privy-io/react-auth";
import {
  transferRequest,
  type Transfer,
  type WalletAsset,
  type TransactionStatus,
} from "../shared/wallet";

type ChainWallet = Pick<
  ConnectedWallet,
  "address" | "chainId" | "switchChain" | "getEthereumProvider"
>;
export async function switchWalletChain(
  currentWallet: () => ChainWallet | undefined,
  chainId: WalletChainId,
) {
  const original = currentWallet();
  if (!original) throw new Error("Your wallet is no longer connected.");
  await original.switchChain(chainId);
  // Privy's embedded switchChain resolves after scheduling a React update.
  // Use the new wallet object, whose provider captures the selected chain.
  for (let attempt = 0; attempt < 30; attempt++) {
    const current = currentWallet();
    if (
      !current ||
      current.address.toLowerCase() !== original.address.toLowerCase()
    )
      throw new Error("Your account changed. Open your current wallet.");
    if (current.chainId === `eip155:${chainId}`) {
      const provider = await current.getEthereumProvider();
      if (Number(await provider.request({ method: "eth_chainId" })) !== chainId)
        throw new Error("The selected network is not active.");
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Network switch did not complete. Please try again.");
}

const rpc = (chainId: WalletChainId) =>
  createPublicClient({
    chain: walletChain(chainId),
    transport: http(undefined, { timeout: 8000, retryCount: 0 }),
  });
async function checkedRpc(chainId: WalletChainId) {
  const client = rpc(chainId);
  if ((await client.getChainId()) !== chainId)
    throw new Error("The RPC returned the wrong network. Please retry later.");
  return client;
}
export async function walletAssets(
  owner: Address,
  chainId: WalletChainId,
  token?: string,
): Promise<WalletAsset[]> {
  if (token && !isAddress(token))
    throw new Error("Enter a valid ERC-20 contract address.");
  const client = await checkedRpc(chainId);
  const native: WalletAsset = {
    address: null,
    symbol: "ETH",
    decimals: 18,
    balance: (await client.getBalance({ address: owner })).toString(),
  };
  const address =
    token ?? (chainId === 4663 ? governanceRules.tokenAddress : null);
  if (!address) return [native];
  const contract = { address: address as Address, abi: erc20Abi };
  const [balance, decimals, symbol] = await Promise.all([
    client.readContract({
      ...contract,
      functionName: "balanceOf",
      args: [owner],
    }),
    client.readContract({ ...contract, functionName: "decimals" }),
    client.readContract({ ...contract, functionName: "symbol" }),
  ]);
  return [
    native,
    {
      address: address as Address,
      symbol: symbol.slice(0, 64),
      decimals,
      balance: balance.toString(),
    },
  ];
}
export async function prepareTransfer(owner: Address, transfer: Transfer) {
  // Re-read contract decimals and balances; form data is only a preview.
  const assets = await walletAssets(
    owner,
    transfer.chainId,
    transfer.asset.address ?? undefined,
  );
  const current = assets.find(
    (a) => a.address?.toLowerCase() === transfer.asset.address?.toLowerCase(),
  );
  if (!current || current.decimals !== transfer.asset.decimals)
    throw new Error("Asset details changed. Refresh before sending.");
  const tx = transferRequest({ ...transfer, asset: current });
  const client = await checkedRpc(transfer.chainId);
  if (current.address) {
    const result = await client.call({ account: owner, ...tx });
    // ERC-20 false means failure even if the call itself did not revert.
    if (result.data && result.data !== "0x" && BigInt(result.data) === 0n)
      throw new Error("This token refused the transfer.");
  }
  const [gas, gasPrice] = await Promise.all([
    client.estimateGas({ account: owner, ...tx }),
    client.getGasPrice(),
  ]);
  const eth = BigInt(assets[0]!.balance);
  if (tx.value + gas * gasPrice > eth)
    throw new Error(
      "Insufficient funds for the amount and ETH transaction fee.",
    );
  return tx;
}
export async function transactionStatus(
  chainId: WalletChainId,
  hash: Hex,
): Promise<TransactionStatus> {
  const client = await checkedRpc(chainId);
  try {
    const receipt = await client.getTransactionReceipt({ hash });
    return receipt.status === "success" ? "confirmed" : "reverted";
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "TransactionReceiptNotFoundError"
    )
      return "pending";
    throw error;
  }
}
