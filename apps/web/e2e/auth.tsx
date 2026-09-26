// Browser fixture entry only. Production root uses components/auth.tsx directly.
import { useEffect, useState, type ReactNode } from "react";
import { AuthContext } from "../src/components/auth";
export function AuthProvider({
  children,
}: {
  children: ReactNode;
  appId: string;
}) {
  const [user, setUser] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setUser(sessionStorage.getItem("musecity.fixture-user"));
    setReady(true);
  }, []);
  function change(value: string | null) {
    setUser(value);
    if (value) sessionStorage.setItem("musecity.fixture-user", value);
    else sessionStorage.removeItem("musecity.fixture-user");
  }
  return (
    <AuthContext
      value={{
        ready,
        userId: user,
        login: () => change("alice"),
        logout: async () => change(null),
        token: async () => (user ? "fixture:" + user : null),
        retryWallet: async () => {},
        link: () => {},
        linked: ["twitter_oauth"],
        configured: ready,
      }}
    >
      <div
        className="bg-amber-50 text-amber-900 text-center text-[10px] p-1"
        data-testid="fixture-banner"
      >
        LOCAL TEST · simulated identity · real local PostgreSQL{" "}
        <button
          className="underline ml-3"
          onClick={() => change(user === "bob" ? "alice" : "bob")}
        >
          Switch test account
        </button>
      </div>
      {children}
    </AuthContext>
  );
}
