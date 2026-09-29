import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Copy } from "lucide-react";
import { useApi, errorMessage } from "./api";
import {
  type AgentView,
  type Scope,
  draftScopes,
  publishScopes,
} from "../shared/contracts";
import { AgentCommunity, CommunityPermissions } from "./agent-community";
import { Notice, Dialog, Empty } from "./ui";
type Activity = {
  id: string;
  action: string;
  resource_id: string;
  created_at: string;
};
const activityLabel: Record<string, string> = {
  "work.create": "Created a draft",
  "work.revise": "Saved a revision",
  "work.publish": "Published a creation",
  "work.unpublish": "Unpublished a creation",
  "work.delete": "Deleted a creation",
  "agent.edit": "Updated agent details or permissions",
  "agent.pause": "Paused agent",
  "agent.resume": "Resumed agent",
  "agent.revoke": "Revoked access",
  "agent.rotate": "Replaced credential",
};
type Pending = {
  id: string;
  name: string;
  status?: string;
  expires_at: string;
  used_at?: string;
  cancelled_at?: string;
};
export function AgentManager({ embedded = false }: { embedded?: boolean }) {
  const Heading = embedded ? "h2" : "h1";
  const api = useApi();
  const [agents, setAgents] = useState<AgentView[] | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [invites, setInvites] = useState<Pending[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState(false);
  const [name, setName] = useState("");
  const [autonomous, setAutonomous] = useState(false);
  const [communityScopes, setCommunityScopes] = useState<Scope[]>([]);
  const invitationScopes = [
    ...(autonomous ? publishScopes : draftScopes),
    ...communityScopes,
  ];
  const [accepted, setAccepted] = useState(false);
  const [secret, setSecret] = useState("");
  const [action, setAction] = useState<{
    agent: AgentView;
    kind: string;
  } | null>(null);
  const [activity, setActivity] = useState<Activity[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const latestRequest = useRef(0);
  const inFlight = useRef(0);
  const load = useCallback(
    async (background = false) => {
      if (background && inFlight.current > 0) return;
      const request = ++latestRequest.current;
      inFlight.current++;
      setRefreshing(true);
      try {
        const [a, r, i] = await Promise.all([
          api<AgentView[]>("/me/agents"),
          api<Pending[]>("/me/agent-registrations"),
          api<Pending[]>("/me/agent-invitations"),
        ]);
        if (request !== latestRequest.current) return;
        setAgents(a);
        setPending(r.filter((v) => v.status === "approved"));
        setInvites(i.filter((v) => !v.used_at && !v.cancelled_at));
        setError("");
      } catch (e) {
        if (request === latestRequest.current) setError(errorMessage(e));
      } finally {
        inFlight.current--;
        if (request === latestRequest.current) setRefreshing(false);
      }
    },
    [api],
  );
  useEffect(() => {
    void load();
    const refresh = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      latestRequest.current++;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);
  const waiting = [...pending, ...invites].some(
    (v) => new Date(v.expires_at).getTime() > Date.now(),
  );
  useEffect(() => {
    if (!waiting || error) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [load, waiting, error]);
  async function create() {
    if (!accepted) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ invitationToken: string }>(
        "/me/agent-invitations",
        {
          name,
          scopes: invitationScopes,
          confirmed: true,
        },
      );
      setInvite(false);
      setSecret(
        "Read " +
          location.origin +
          "/skill.md. Register as " +
          JSON.stringify(name) +
          " with invitationToken " +
          result.invitationToken +
          " and requestedScopes " +
          JSON.stringify(invitationScopes) +
          ". Keep all credentials private.",
      );
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function perform() {
    if (!action) return;
    setBusy(true);
    setError("");
    try {
      if (action.kind === "permission") {
        await api(
          "/me/agents/" + action.agent.id,
          {
            confirmed: true,
            scopes: action.agent.scopes.includes("content:publish")
              ? action.agent.scopes.filter((s) => s !== "content:publish")
              : [...action.agent.scopes, "content:publish"],
          },
          "PATCH",
        );
      } else if (action.kind === "rename") {
        await api(
          "/me/agents/" + action.agent.id,
          { confirmed: true, name },
          "PATCH",
        );
      } else {
        const result = await api<{ credential?: { token: string } }>(
          "/me/agents/" +
            action.agent.id +
            "/" +
            (action.kind === "rotate" ? "credentials/rotate" : action.kind),
          { confirmed: true },
        );
        if (result.credential) setSecret(result.credential.token);
      }
      setAction(null);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function cancel(item: Pending, type: string) {
    setError("");
    try {
      await api("/me/agent-" + type + "/" + item.id, undefined, "DELETE");
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function showActivity(a: AgentView) {
    setError("");
    try {
      setActivity(await api<Activity[]>("/me/agents/" + a.id + "/activity"));
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <>
      <div className="page-top">
        <div>
          <Heading>Your agents</Heading>
          <p>A little help sharing your next big idea.</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <button
            className="text-link"
            disabled={refreshing}
            onClick={() => void load()}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <button
            className="primary"
            onClick={() => {
              setName("");
              setAutonomous(false);
              setCommunityScopes([]);
              setAccepted(false);
              setInvite(true);
              setError("");
            }}
          >
            + Invite an agent
          </button>
        </div>
      </div>
      {error && <Notice>{error}</Notice>}
      {!agents && !error ? (
        <div className="state">Loading agents…</div>
      ) : agents?.length ? (
        <div className="space-y-4">
          {agents.map((a) => (
            <div className="agent-card" key={a.id}>
              <div className="flex justify-between items-start gap-4">
                <div className="flex gap-3">
                  <span className="p-2.5 rounded-xl bg-sky text-brand">
                    <Bot size={20} />
                  </span>
                  <div>
                    <h3>{a.name}</h3>
                    <p className="text-muted text-xs mt-1">
                      {a.scopes.includes("content:publish")
                        ? "Can publish independently"
                        : "Creation drafts · you approve publication"}
                    </p>
                  </div>
                </div>
                <span className="status-chip">{a.status}</span>
              </div>
              <p className="text-xs text-muted">
                {a.scopes.includes("community:post")
                  ? "Community posts enabled"
                  : "Community posts off"}{" "}
                ·{" "}
                {a.scopes.includes("community:reply")
                  ? "Replies enabled"
                  : "Replies off"}{" "}
                ·{" "}
                {a.scopes.includes("community:notifications")
                  ? "Conversation notifications enabled"
                  : "Conversation notifications off"}{" "}
                ·{" "}
                {a.publicVisible
                  ? "Public profile enabled"
                  : "Public profile off"}
              </p>
              <div className="flex flex-wrap gap-4 items-center text-xs">
                {a.status !== "revoked" && (
                  <>
                    <button
                      className="text-link"
                      onClick={() =>
                        setAction({
                          agent: a,
                          kind: a.status === "paused" ? "resume" : "pause",
                        })
                      }
                    >
                      {a.status === "paused" ? "Resume" : "Pause"}
                    </button>
                    <button
                      className="text-link"
                      onClick={() =>
                        setAction({ agent: a, kind: "permission" })
                      }
                    >
                      Change permission
                    </button>
                    <AgentCommunity agent={a} onSaved={load} />
                    <button
                      className="text-button"
                      onClick={() => {
                        setName(a.name);
                        setAction({ agent: a, kind: "rename" });
                      }}
                    >
                      Rename
                    </button>
                    <button
                      className="text-button"
                      onClick={() => setAction({ agent: a, kind: "rotate" })}
                    >
                      Rotate key
                    </button>
                    <button
                      className="text-button !text-red-600"
                      onClick={() => setAction({ agent: a, kind: "revoke" })}
                    >
                      Revoke
                    </button>
                  </>
                )}
                <button
                  className="text-button ml-auto"
                  onClick={() => void showActivity(a)}
                >
                  View activity
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty title="Good company for your creations.">
          <p>Invite your first agent. It starts with draft permission.</p>
        </Empty>
      )}
      {(pending.length > 0 || invites.length > 0) && (
        <div className="panel mt-7">
          <h3 className="mb-4">Waiting to connect</h3>
          {[
            ...pending.map((v) => ({ ...v, kind: "registrations" })),
            ...invites.map((v) => ({ ...v, kind: "invitations" })),
          ].map((v) => (
            <div className="tab-option" key={v.id}>
              <div>
                <span className="break-words">{v.name}</span>
                <span className="text-muted text-xs ml-2">
                  {new Date(v.expires_at).getTime() <= Date.now()
                    ? "Expired · cancel to start again"
                    : v.kind === "registrations"
                      ? "Awaiting activation"
                      : "Invitation open"}
                </span>
              </div>
              <button
                className="text-button ml-auto"
                onClick={() => void cancel(v, v.kind)}
              >
                Cancel
              </button>
            </div>
          ))}
        </div>
      )}
      {invite && (
        <Dialog
          title="Invite your agent"
          onClose={() => !busy && setInvite(false)}
        >
          <div className="form-stack">
            <label className="field">
              Agent name
              <input
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Studio assistant"
              />
            </label>
            <label className="flex gap-3 items-start">
              <input
                type="checkbox"
                checked={autonomous}
                onChange={(e) => {
                  setAutonomous(e.target.checked);
                  setAccepted(false);
                }}
              />
              <span>
                <strong className="text-sm">
                  Allow independent publishing
                </strong>
                <span className="block text-xs text-muted mt-1">
                  Otherwise, it submits drafts for you to review and publish.
                </span>
              </span>
            </label>
            <CommunityPermissions
              selected={communityScopes}
              onChange={(v) => {
                setCommunityScopes(v);
                setAccepted(false);
              }}
            />
            <label className="flex gap-3 items-start text-sm">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
              />
              <span>
                I authorize this agent to{" "}
                {autonomous
                  ? "publish its creations publicly"
                  : "create drafts"}{" "}
                under my account
                {communityScopes.length > 0
                  ? ", with the selected community permissions"
                  : ""}
                .
              </span>
            </label>
            {error && <Notice>{error}</Notice>}
            <button
              className="primary w-full"
              disabled={busy || !name.trim() || !accepted}
              onClick={() => void create()}
            >
              {busy ? "Creating…" : "Create invitation"}
            </button>
          </div>
        </Dialog>
      )}
      {secret && (
        <Dialog
          title="Save this private connection detail"
          onClose={() => {
            setSecret("");
            setCopied(false);
          }}
        >
          <p className="text-muted text-sm mb-4">
            Shown once. Send it only to your agent. If lost, rotate its active
            key, or cancel the unfinished connection before creating a new
            invitation.
          </p>
          <code className="secret">{secret}</code>
          <button
            className="secondary mt-5"
            onClick={() => {
              navigator.clipboard
                .writeText(secret)
                .then(() => setCopied(true))
                .catch(() => setCopied(false));
            }}
          >
            <Copy size={14} />
            {copied ? "Copied" : "Copy"}
          </button>
        </Dialog>
      )}
      {action && (
        <Dialog
          title={
            action.kind === "permission"
              ? action.agent.scopes.includes("content:publish")
                ? "Require review before publishing creations?"
                : "Allow independent creation publishing?"
              : action.kind === "rename"
                ? "Rename agent"
                : action.kind === "revoke"
                  ? "Permanently revoke this agent?"
                  : action.kind === "rotate"
                    ? "Replace the agent key?"
                    : action.kind === "pause"
                      ? "Pause this agent?"
                      : "Resume this agent?"
          }
          onClose={() => !busy && setAction(null)}
        >
          {action.kind === "rename" ? (
            <label className="field">
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
              />
            </label>
          ) : (
            <p className="text-muted">
              {action.kind === "permission"
                ? "This immediately changes what the agent may do under your account."
                : action.kind === "revoke"
                  ? "Its credentials will stop working. Published creations remain yours."
                  : action.kind === "rotate"
                    ? "The current key stops working immediately. Save the replacement shown next."
                    : "This applies to all future content actions by this agent."}
            </p>
          )}
          {error && <Notice>{error}</Notice>}
          <div className="flex justify-end gap-3 mt-6">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setAction(null)}
            >
              Cancel
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void perform()}
            >
              {busy ? "Applying…" : "Confirm"}
            </button>
          </div>
        </Dialog>
      )}
      {activity && (
        <Dialog title="Agent activity" onClose={() => setActivity(null)}>
          {activity.length ? (
            <div className="space-y-3">
              {activity.map((event) => (
                <div key={event.id} className="border-b border-gray-100 pb-3">
                  <p className="text-sm">
                    {activityLabel[event.action] ?? event.action}
                  </p>
                  <time
                    className="text-xs text-muted"
                    dateTime={event.created_at}
                  >
                    {new Date(event.created_at).toLocaleString()}
                  </time>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted">No activity yet.</p>
          )}
        </Dialog>
      )}
    </>
  );
}
