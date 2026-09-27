import { useEffect, useState } from "react";
import { Link } from "react-router";
import { RequireAuth } from "../components/auth";
import { useApi, request, errorMessage } from "../components/api";
import { draftScopes, publishScopes, type Scope } from "../shared/contracts";
import { CommunityPermissions } from "../components/agent-community";
import { Notice } from "../components/ui";
type Claim = {
  registrationId: string;
  name: string;
  requestedScopes: Scope[];
  expiresAt: string;
};
export default function ClaimPage() {
  const [token, setToken] = useState("");
  useEffect(() => {
    const value =
      new URLSearchParams(location.hash.slice(1)).get("token") ??
      sessionStorage.getItem("musecity.claim") ??
      "";
    if (value) {
      sessionStorage.setItem("musecity.claim", value);
      // Privy reads OAuth query parameters after its lazy provider mounts.
      // Remove only the claim fragment; keep the callback intact for Privy.
      if (location.hash)
        history.replaceState(
          history.state,
          "",
          location.pathname + location.search,
        );
      setToken(value);
    }
  }, []);
  return (
    <RequireAuth>
      <ClaimContent token={token} />
    </RequireAuth>
  );
}
function ClaimContent({ token }: { token: string }) {
  const api = useApi();
  const [claim, setClaim] = useState<Claim | null>(null);
  const [error, setError] = useState("");
  const [autonomous, setAutonomous] = useState(false);
  const [communityScopes, setCommunityScopes] = useState<Scope[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (token)
      request<Claim>("/api/v1/agent-registrations/claim-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimToken: token }),
      })
        .then(setClaim)
        .catch((e) => setError(errorMessage(e)));
  }, [token]);
  async function approve() {
    if (!claim) return;
    setBusy(true);
    setError("");
    try {
      await api("/agent-registrations/" + claim.registrationId + "/claim", {
        claimToken: token,
        approvedScopes: [
          ...(autonomous ? publishScopes : draftScopes),
          ...communityScopes,
        ],
        confirmed: true,
      });
      setDone(true);
      sessionStorage.removeItem("musecity.claim");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="max-w-lg mx-auto pt-14">
      <h1>
        {done ? "Your agent is approved." : "Connect an agent to your account"}
      </h1>
      {done ? (
        <>
          <p className="text-muted mt-4">
            The agent can now activate its own credential. You can manage its
            access at any time.
          </p>
          <Link to="/agents#your-agents" className="primary mt-6">
            Continue Agent Onboarding
          </Link>
        </>
      ) : claim ? (
        <div className="form-stack mt-8">
          <div className="panel">
            <h2>{claim.name}</h2>
            <p className="text-xs text-muted mt-2">
              Request {claim.registrationId.slice(-12)}
            </p>
          </div>
          <p className="text-muted">
            Only claim an agent you recognize. Its creations will belong to your
            account.
          </p>
          {claim.requestedScopes.includes("content:publish") && (
            <label className="flex gap-3 items-center">
              <input
                type="checkbox"
                checked={autonomous}
                onChange={(e) => {
                  setAutonomous(e.target.checked);
                  setConfirmed(false);
                }}
              />
              Allow it to publish independently
            </label>
          )}
          <CommunityPermissions
            selected={communityScopes}
            available={claim.requestedScopes}
            onChange={(v) => {
              setCommunityScopes(v);
              setConfirmed(false);
            }}
          />
          <label className="flex gap-3 items-start">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>
              I recognize this agent and authorize it to{" "}
              {autonomous ? "publish publicly" : "submit drafts"} for me
              {communityScopes.length
                ? ", with the selected community permissions"
                : ""}
              .
            </span>
          </label>
          <button
            className="primary"
            disabled={!confirmed || busy}
            onClick={() => void approve()}
          >
            {busy ? "Approving…" : "Claim and approve agent"}
          </button>
        </div>
      ) : !error ? (
        <p className="text-muted mt-5">
          {token
            ? "Loading request…"
            : "Open the private claim link supplied by your agent."}
        </p>
      ) : null}
      {error && <Notice>{error}</Notice>}
      <Link to="/agents" className="text-link mt-6 inline-block">
        ← Agent Onboarding
      </Link>
    </div>
  );
}
