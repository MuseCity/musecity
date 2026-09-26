import { PrivyProvider, usePrivy, useCreateWallet } from "@privy-io/react-auth";
import { base } from "viem/chains";
import { defineChain } from "viem";
import { type ReactNode } from "react";
import { AuthContext } from "./auth";
const robinhood = defineChain({
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
function Session({ children }: { children: ReactNode }) {
  const p = usePrivy();
  const { createWallet } = useCreateWallet();
  return (
    <AuthContext
      value={{
        ready: p.ready,
        userId: p.authenticated ? (p.user?.id ?? null) : null,
        login: p.login,
        logout: p.logout,
        token: p.getAccessToken,
        walletAddress: p.user?.wallet?.address,
        retryWallet: async () => {
          await createWallet();
        },
        link: (kind) => {
          if (kind === "email") p.linkEmail();
          else if (kind === "google") p.linkGoogle();
          else if (kind === "twitter") p.linkTwitter();
          else p.linkWallet();
        },
        linked:
          p.user?.linkedAccounts
            .filter(
              (a) => a.type !== "wallet" || a.walletClientType !== "privy",
            )
            .map((a) => a.type) ?? [],
        configured: true,
      }}
    >
      {children}
    </AuthContext>
  );
}
export default function LiveAuth({
  appId,
  children,
}: {
  appId: string;
  children: ReactNode;
}) {
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email", "google", "twitter", "wallet"],
        defaultChain: base,
        supportedChains: [base, robinhood],
        appearance: {
          theme: "light",
          accentColor: "#9F1D2D",
          logo: "/brand/horizontal.png",
        },
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
        },
      }}
    >
      <Session>{children}</Session>
    </PrivyProvider>
  );
}
