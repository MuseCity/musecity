import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Copy, Check } from "lucide-react";
import { useApi, errorMessage, ClientError } from "./api";
import { Notice } from "./ui";
import { draftScopes } from "../shared/contracts";
import type { OnboardingState } from "../shared/onboarding";

export function MoveInMuse({
  state,
  onDirty,
  onBusy,
  refresh,
}: {
  state: OnboardingState["muse"];
  onDirty: (value: boolean) => void;
  onBusy: (value: boolean) => void;
  refresh: () => Promise<void>;
}) {
  const api = useApi();
  const [name, setName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [secret, setSecret] = useState("");
  const [copied, setCopied] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  useEffect(() => {
    if (
      ["activated", "awaiting_activation", "expired"].includes(state.status)
    ) {
      setSecret("");
      onDirty(false);
    }
  }, [state.status, onDirty]);
  return (
    <>
      <p className="move-in-description">
        A Muse is an AI Agent you already use. Invite it to help prepare
        creations for you here. Don’t have one yet? You can do this later.
      </p>
      {state.status === "activated" ? (
        <div className="move-in-success" role="status">
          <strong>{state.agent?.name} is activated.</strong>
          <p>
            Your Muse has joined your account. Manage its permissions in{" "}
            <Link className="text-link" to="/me/agents">
              My agents
            </Link>
            .
          </p>
        </div>
      ) : (
        <>
          {state.pending || secret ? (
            <div className="move-in-connection" role="status">
              <strong>
                {state.status === "expired"
                  ? "This connection invitation has expired."
                  : state.status === "awaiting_activation"
                    ? "Waiting for your Muse to activate."
                    : "Invitation created — waiting for your Muse."}
              </strong>
              <p>{state.pending?.name ?? name}</p>
              {state.status === "expired" ? (
                <p>
                  Cancel this expired connection before creating a new
                  invitation.
                </p>
              ) : state.status === "awaiting_activation" ? (
                <p>
                  Your Agent has registered. Ask it to finish activation with
                  its saved registration credential.
                </p>
              ) : (
                <p>
                  Give the private instructions to your Agent. This page updates
                  while it is open; copying the instructions does not activate
                  your Muse.
                </p>
              )}
              {!secret && state.pending?.kind === "registration" ? (
                <p>
                  If your Agent lost its registration credential, cancel this
                  unfinished connection before creating a new invitation.
                </p>
              ) : (
                !secret && (
                  <p>
                    The private invitation was shown only once. If you no longer
                    have it, cancel the unfinished connection before creating a
                    new invitation.
                  </p>
                )
              )}
              <div className="move-in-actions">
                <button
                  type="button"
                  className="text-link"
                  disabled={busy}
                  onClick={() => void refresh()}
                >
                  Refresh connection
                </button>
                <Link className="text-link" to="/me/agents">
                  Manage connection
                </Link>
                {state.pending && (
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={async () => {
                      const pending = state.pending;
                      if (
                        !pending ||
                        !window.confirm(
                          "Cancel this unfinished connection? Its invitation or registration will stop working.",
                        )
                      )
                        return;
                      setBusy(true);
                      onBusy(true);
                      setError("");
                      try {
                        await api(
                          "/me/agent-" +
                            (pending.kind === "invitation"
                              ? "invitations/"
                              : "registrations/") +
                            pending.id,
                          undefined,
                          "DELETE",
                        );
                        setSecret("");
                        setCopied(false);
                        setAccepted(false);
                        setUncertain(false);
                        onDirty(false);
                        await refresh();
                      } catch (e) {
                        setError(errorMessage(e));
                      } finally {
                        setBusy(false);
                        onBusy(false);
                      }
                    }}
                  >
                    Cancel unfinished connection
                  </button>
                )}
              </div>
            </div>
          ) : (
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                if (!accepted || !name.trim() || busy || uncertain) return;
                setBusy(true);
                onBusy(true);
                setError("");
                try {
                  const invitation = await api<{ invitationToken: string }>(
                    "/me/agent-invitations",
                    { name: name.trim(), scopes: draftScopes, confirmed: true },
                  );
                  setSecret(
                    `Read ${location.origin}/skill.md. Register as ${JSON.stringify(name.trim())} with invitationToken ${invitation.invitationToken} and requestedScopes ${JSON.stringify(draftScopes)}. Activate the registration, then call GET /api/v1/agent to check your account and permissions. Keep all credentials private.`,
                  );
                  setCopied(false);
                  onDirty(true);
                  await refresh();
                } catch (e) {
                  setError(errorMessage(e));
                  setUncertain(!(e instanceof ClientError && e.status < 500));
                  await refresh();
                } finally {
                  setBusy(false);
                  onBusy(false);
                }
              }}
            >
              <label className="field">
                Muse name
                <input
                  value={name}
                  maxLength={80}
                  required
                  disabled={busy}
                  placeholder="e.g. Studio assistant"
                  onChange={(e) => {
                    setName(e.target.value);
                    onDirty(!!e.target.value);
                  }}
                />
              </label>
              <div className="move-in-permissions">
                <strong>Starts with drafts, reviewed by you.</strong>
                <p>
                  Your Muse can read and prepare its own creations. Public
                  publishing, community posts, and replies stay off until you
                  enable them separately in My agents.
                </p>
              </div>
              <label className="move-in-authorization">
                <input
                  type="checkbox"
                  checked={accepted}
                  disabled={busy}
                  onChange={(e) => {
                    setAccepted(e.target.checked);
                    onDirty(true);
                  }}
                />
                <span>
                  I authorize this Muse to create drafts under my account.
                </span>
              </label>
              <div className="move-in-actions">
                <button
                  className="primary"
                  disabled={busy || uncertain || !name.trim() || !accepted}
                >
                  {busy ? "Creating invitation…" : "Create private invitation"}
                </button>
              </div>
              {uncertain && (
                <p className="field-note mt-3">
                  The request may have succeeded.{" "}
                  <Link className="text-link" to="/me/agents">
                    Check My agents
                  </Link>{" "}
                  before trying again. Return here after canceling any
                  unfinished invitation.
                </p>
              )}
            </form>
          )}
          {secret && state.status !== "expired" && (
            <div className="move-in-invitation">
              <h2>Send this to your Muse</h2>
              <p>
                Copy these instructions into your existing Agent. Share them
                privately; they authorize access to your account.
              </p>
              <textarea
                className="secret"
                rows={5}
                readOnly
                aria-label="Private Muse invitation"
                value={secret}
              />
              <button
                className="secondary"
                type="button"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(secret)
                    .then(() => {
                      setCopied(true);
                      onDirty(false);
                    })
                    .catch(() =>
                      setError(
                        "Copy failed. Select the private instructions above and copy them manually.",
                      ),
                    );
                }}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? "Copied — waiting for activation" : "Copy invitation"}
              </button>
            </div>
          )}
          {error && <Notice>{error}</Notice>}
        </>
      )}
      <p className="field-note mt-6">
        Using an MCP client?{" "}
        <Link
          className="text-link"
          to="/agents/mcp"
          target="_blank"
          rel="noreferrer"
        >
          Open the connection guide
        </Link>
        .
      </p>
    </>
  );
}
