import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { formatUnits, type Hex } from "viem";
import { RequireAuth, useAuth } from "../components/auth";
import { Dialog, Notice } from "../components/ui";
import { MembershipCard, useMembership } from "../components/membership";
import {
  walletChain,
  walletChains,
  type WalletChainId,
} from "../shared/chains";
import {
  transferRequest,
  walletError,
  type Transfer,
  type WalletAsset,
  type TransactionStatus,
} from "../shared/wallet";

export const meta = () => [{ title: "Your wallet — musecity" }];
type Transaction = {
  hash: Hex;
  chainId: WalletChainId;
  status: TransactionStatus;
  description: string;
};
export default function Wallet() {
  return (
    <RequireAuth
      title="Your Musecity wallet."
      description="Sign in to receive tokens, transfer assets and check your formal membership."
    >
      <WalletPage />
    </RequireAuth>
  );
}
function WalletPage() {
  const auth = useAuth(),
    wallet = auth.wallet,
    member = useMembership();
  const [chainId, setChainId] = useState<WalletChainId>(4663);
  const [assets, setAssets] = useState<WalletAsset[]>([]);
  const [assetIndex, setAssetIndex] = useState(0);
  const [token, setToken] = useState("");
  const [loadedToken, setLoadedToken] = useState("");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [review, setReview] = useState<Transfer | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const generation = useRef(0),
    alive = useRef(true);
  const storageKey = "musecity.wallet.transactions:" + auth.userId;
  useEffect(() => {
    alive.current = true;
    try {
      const saved: unknown = JSON.parse(
        sessionStorage.getItem(storageKey) ?? "[]",
      );
      if (Array.isArray(saved))
        setTransactions(
          saved
            .filter(
              (t): t is Transaction =>
                !!t &&
                typeof t === "object" &&
                /^0x[0-9a-fA-F]{64}$/.test(t.hash) &&
                [4663, 8453].includes(t.chainId) &&
                ["pending", "confirmed", "reverted"].includes(t.status) &&
                typeof t.description === "string",
            )
            .slice(0, 5),
        );
    } catch {
      /* Session history is optional. */
    }
    return () => {
      alive.current = false;
      generation.current++;
    };
  }, [storageKey]);
  function saveTransactions(
    update: (previous: Transaction[]) => Transaction[],
  ) {
    if (!alive.current) return;
    setTransactions((previous) => {
      const next = update(previous).slice(0, 5);
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* Still show the transaction. */
      }
      return next;
    });
  }
  const refresh = useCallback(
    async (id = chainId, contract = loadedToken) => {
      if (!wallet) return;
      const run = ++generation.current;
      setLoading(true);
      setError("");
      setAssets([]);
      try {
        const result = await wallet.assets(id, contract || undefined);
        if (generation.current === run && alive.current) {
          setAssets(result);
          setAssetIndex((previous) => Math.min(previous, result.length - 1));
        }
      } catch (e) {
        if (generation.current === run && alive.current)
          setError(walletError(e));
      } finally {
        if (generation.current === run && alive.current) setLoading(false);
      }
    },
    [wallet, chainId, loadedToken],
  );
  useEffect(() => {
    void refresh();
  }, [refresh]);
  async function switchNetwork(id: WalletChainId) {
    if (!wallet || busy) return;
    setBusy(true);
    setError("");
    try {
      await wallet.switchChain(id);
      if (alive.current) {
        setChainId(id);
        setToken("");
        setLoadedToken("");
        setAmount("");
        setAssets([]);
      }
    } catch (e) {
      if (alive.current) setError(walletError(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function checkTransaction(tx: Transaction) {
    if (!wallet) return;
    setBusy(true);
    setError("");
    try {
      const status = await wallet.status(tx.chainId, tx.hash);
      saveTransactions((previous) =>
        previous.map((item) =>
          item.hash === tx.hash && item.chainId === tx.chainId
            ? { ...item, status }
            : item,
        ),
      );
      if (status !== "pending") {
        await refresh();
        member.reload();
      }
    } catch (e) {
      if (alive.current)
        setError(
          "Status is unavailable. The transaction may still be pending. " +
            walletError(e),
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function send() {
    if (!wallet || !review || busy) return;
    setBusy(true);
    setError("");
    try {
      const hash = await wallet.send(review);
      const tx: Transaction = {
        hash,
        chainId: review.chainId,
        status: "pending",
        description: `${review.amount} ${review.asset.symbol} to ${review.recipient}`,
      };
      saveTransactions((previous) => [
        tx,
        ...previous.filter((item) => item.hash !== hash),
      ]);
      if (alive.current) {
        setReview(null);
        setAmount("");
      }
      try {
        const status = await wallet.status(tx.chainId, hash);
        saveTransactions((previous) =>
          previous.map((item) =>
            item.hash === hash ? { ...item, status } : item,
          ),
        );
      } catch {
        /* Hash is retained; the user can recheck without resending. */
      }
      if (alive.current) {
        await refresh();
        member.reload();
      }
    } catch (e) {
      if (alive.current) {
        setReview(null);
        setError(walletError(e));
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  const chain = walletChain(chainId);
  return (
    <div className="governance-layout">
      <div className="page-top">
        <div>
          <h1>Your wallet.</h1>
          <p>Receive and send assets on Robinhood Chain and Base.</p>
        </div>
        <Link className="text-link" to="/governance">
          Governance
        </Link>
      </div>
      <div className="wallet-grid">
        <section className="governance-panel">
          <h2>Musecity embedded wallet</h2>
          {!wallet ? (
            <>
              <p>
                {!auth.walletsReady
                  ? "Loading your wallet…"
                  : auth.walletAddress
                    ? "Your wallet is connecting. Try reconnecting your session if it remains unavailable."
                    : "Create your wallet to receive tokens. Your account and voting access are already available."}
              </p>
              <button
                className="primary"
                disabled={busy || !auth.walletsReady || !!auth.walletAddress}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await auth.retryWallet();
                    member.reload();
                  } catch (e) {
                    setError(walletError(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Creating…" : "Create / retry wallet"}
              </button>
            </>
          ) : (
            <>
              <label>
                Network
                <select
                  value={chainId}
                  disabled={busy || !!review}
                  onChange={(e) =>
                    void switchNetwork(Number(e.target.value) as WalletChainId)
                  }
                >
                  {walletChains.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name}
                      {c.id === 4663 ? " (default)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <h3 className="mt-5">Receive on {chain.name}</h3>
              <code className="wallet-address">{wallet.address}</code>
              <p className="text-sm text-muted">
                Send assets using this network. Switching networks does not
                bridge or move your tokens.
              </p>
              <div className="flex flex-wrap gap-4">
                <button
                  className="secondary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(wallet.address);
                      setCopied(true);
                    } catch {
                      setError(
                        "Could not copy. Select the address above to copy it.",
                      );
                    }
                  }}
                >
                  {copied ? "Copied" : "Copy address"}
                </button>
                <a
                  className="text-link"
                  href={`${chain.blockExplorers.default.url}/address/${wallet.address}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View wallet activity ↗
                </a>
              </div>
              <div className="flex items-center justify-between mt-6">
                <h3>Balances</h3>
                <button
                  className="text-link"
                  disabled={loading || busy}
                  onClick={() => void refresh()}
                >
                  Refresh
                </button>
              </div>
              {loading && <p role="status">Reading {chain.name}…</p>}
              <ul className="wallet-balances">
                {assets.map((asset) => (
                  <li key={asset.address ?? "ETH"}>
                    <div>
                      <strong>{asset.symbol}</strong>
                      {asset.address && (
                        <span className="wallet-address text-xs">
                          {asset.address}
                        </span>
                      )}
                    </div>
                    <span>
                      {formatUnits(BigInt(asset.balance), asset.decimals)}
                    </span>
                  </li>
                ))}
              </ul>
              <form
                className="space-y-3 mt-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  setLoadedToken(token.trim());
                  setAmount("");
                  setAssetIndex(0);
                  if (token.trim() === loadedToken) void refresh();
                }}
              >
                <label>
                  ERC-20 contract on {chain.name}
                  <input
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="0x…"
                    autoComplete="off"
                  />
                </label>
                <button className="secondary" disabled={busy || loading}>
                  Load token
                </button>
              </form>
            </>
          )}
        </section>
        <MembershipCard query={member} />
      </div>
      {error && <Notice>{error}</Notice>}
      {wallet && (
        <section className="governance-panel">
          <h2>Send assets</h2>
          <p>
            Review the network, contract, amount and recipient. Privy will ask
            you to confirm the transfer and fee.
          </p>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setError("");
              try {
                const asset = assets[assetIndex];
                if (!asset) throw new Error("Load your balance first.");
                const transfer = {
                  chainId,
                  asset,
                  recipient: recipient.trim(),
                  amount: amount.trim(),
                };
                transferRequest(transfer);
                setReview(transfer);
              } catch (e) {
                setError(walletError(e));
              }
            }}
          >
            <label>
              Asset
              <select
                value={assetIndex}
                disabled={busy || loading || !assets.length}
                onChange={(e) => {
                  setAssetIndex(Number(e.target.value));
                  setAmount("");
                }}
              >
                {assets.map((a, i) => (
                  <option value={i} key={a.address ?? "ETH"}>
                    {a.symbol}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Recipient address
              <input
                required
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                disabled={busy}
                placeholder="0x…"
                autoComplete="off"
              />
            </label>
            <label>
              Amount
              <input
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={busy}
                inputMode="decimal"
                placeholder="0.0"
                autoComplete="off"
              />
            </label>
            <button
              className="primary"
              disabled={busy || loading || !assets.length}
            >
              Review transfer
            </button>
          </form>
        </section>
      )}
      {!!transactions.length && (
        <section className="governance-panel">
          <h2>Recent transfers in this session</h2>
          <p>Recheck a pending transaction instead of sending it again.</p>
          <ul className="space-y-4">
            {transactions.map((tx) => (
              <li key={tx.chainId + tx.hash}>
                <p className="wallet-address">{tx.description}</p>
                <p>
                  <strong>{tx.status}</strong> · {walletChain(tx.chainId).name}
                </p>
                <a
                  className="text-link wallet-address"
                  href={`${walletChain(tx.chainId).blockExplorers.default.url}/tx/${tx.hash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {tx.hash} ↗
                </a>
                {tx.status === "pending" && (
                  <button
                    className="secondary mt-2"
                    disabled={busy}
                    onClick={() => void checkTransaction(tx)}
                  >
                    Check status
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {review && (
        <Dialog
          title="Review transfer"
          onClose={() => {
            if (!busy) setReview(null);
          }}
        >
          <dl className="space-y-3">
            <div>
              <dt>Network</dt>
              <dd>{walletChain(review.chainId).name}</dd>
            </div>
            <div>
              <dt>Amount</dt>
              <dd>
                {review.amount} {review.asset.symbol}
              </dd>
            </div>
            {review.asset.address && (
              <div>
                <dt>Token contract</dt>
                <dd className="wallet-address">{review.asset.address}</dd>
              </div>
            )}
            <div>
              <dt>Recipient</dt>
              <dd className="wallet-address">{review.recipient}</dd>
            </div>
          </dl>
          <p className="mt-4">
            The wallet confirmation shows the network fee. Transfers cannot be
            undone.
          </p>
          <button
            className="primary mt-5"
            disabled={busy}
            onClick={() => void send()}
          >
            {busy ? "Waiting for wallet…" : "Continue to wallet confirmation"}
          </button>
        </Dialog>
      )}
    </div>
  );
}
