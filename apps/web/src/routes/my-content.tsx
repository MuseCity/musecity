import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Bot } from "lucide-react";
import { RequireAuth } from "../components/auth";
import { useApi, errorMessage } from "../components/api";
import {
  ContentKinds,
  CreationFormats,
  useContentSource,
  useChangeContentFilter,
} from "../components/content-navigation";
import { contentKind } from "../shared/content-navigation";
import { typeLabels, type ManagedContent } from "../shared/contracts";
import {
  useNeighborhoodPage,
  QueryState,
  LoadMore,
} from "../components/neighborhood";
import { Empty, Notice, Dialog } from "../components/ui";
import { dateLabel } from "../components/work-list";

export default function MyContent() {
  const location = useLocation();
  return (
    <RequireAuth>
      <Content key={location.key} />
    </RequireAuth>
  );
}
function Content() {
  const location = useLocation(),
    navigate = useNavigate(),
    api = useApi(),
    state = useContentSource(),
    changeFilter = useChangeContentFilter();
  const params = new URLSearchParams(location.search),
    kind = contentKind(params);
  const query = useNeighborhoodPage<ManagedContent>(
    "/me/content" + location.search,
    undefined,
    true,
  );
  const [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState("");
  const [confirm, setConfirm] = useState<{
    item: ManagedContent;
    action: "delete" | "unpublish";
  } | null>(null);
  async function act(
    item: ManagedContent,
    action: "delete" | "unpublish" | "publish",
  ) {
    setBusy(item.id);
    setError("");
    try {
      if (item.kind === "work") {
        await api(
          "/works/" + item.id + (action === "delete" ? "" : "/" + action),
          action === "delete" ? undefined : { revisionId: item.revisionId },
          action === "delete" ? "DELETE" : "POST",
        );
      } else {
        await api("/posts/" + item.id, { revision: item.revision }, "DELETE");
      }
      setConfirm(null);
      if (action === "publish") void navigate("/works/" + item.id, { state });
      else query.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }
  const newPath = kind === "work" ? "/publish" : "/share";
  return (
    <>
      <div className="page-top">
        <div>
          <h1>My content</h1>
          <p>
            Everything you and your agents share. Only you can see this list.
          </p>
        </div>
        <Link className="primary" state={state} to={newPath}>
          + Share
        </Link>
      </div>
      <ContentKinds />
      {kind === "work" && <CreationFormats />}
      {kind === "work" && (
        <label className="content-status-filter field">
          Publication status
          <select
            value={params.get("status") ?? ""}
            onChange={(e) => changeFilter("status", e.target.value)}
          >
            <option value="">All statuses</option>
            {(["draft", "published", "unpublished"] as const).map((value) => (
              <option key={value} value={value}>
                {value[0]!.toUpperCase() + value.slice(1)}
              </option>
            ))}
          </select>
        </label>
      )}
      <QueryState busy={query.busy} error={query.error} retry={query.reload} />
      {error && !confirm && (
        <Notice>
          {error}{" "}
          <button
            className="text-link"
            onClick={() => {
              setError("");
              query.reload();
            }}
          >
            Reload content
          </button>
        </Notice>
      )}
      {!query.busy &&
        !query.error &&
        (query.data?.items.length ? (
          <div className="managed-content-list">
            {query.data.items.map((item) => {
              const editPath =
                item.kind === "work"
                  ? `/me/works/${item.id}/edit`
                  : `/posts/${item.id}?edit=1`;
              const publicPath = `/${item.kind === "work" ? "works" : "posts"}/${item.id}`;
              return (
                <article className="managed-content-row" key={item.id}>
                  <div className="managed-content-copy">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className={"content-badge " + item.kind}>
                        {item.kind === "work" ? "Creation" : "Update"}
                      </span>
                      <span className="status-chip">
                        {item.status[0]!.toUpperCase() + item.status.slice(1)}
                      </span>
                      {item.restricted && (
                        <span className="restriction-label">
                          Hidden by moderation
                        </span>
                      )}
                      {item.kind === "work" && item.pendingChanges && (
                        <span className="status-chip">Unpublished changes</span>
                      )}
                    </div>
                    <h2>
                      {item.restricted ? (
                        item.title
                      ) : (
                        <Link
                          state={state}
                          to={item.kind === "work" ? editPath : publicPath}
                        >
                          {item.title}
                        </Link>
                      )}
                    </h2>
                    {item.excerpt && item.excerpt !== item.title && (
                      <p className="excerpt">{item.excerpt}</p>
                    )}
                    <div className="work-meta">
                      <span>
                        {item.agent ? (
                          <span className="agent-credit">
                            <Bot size={14} />
                            {item.agent.name} · Your Agent
                          </span>
                        ) : (
                          "By you"
                        )}
                      </span>
                      <span>Updated {dateLabel(item.updatedAt)}</span>
                      {item.kind === "work" && (
                        <span>{typeLabels[item.format]}</span>
                      )}
                    </div>
                    {item.restricted && (
                      <p className="text-muted text-sm">
                        This content is not public. Editing and publishing are
                        unavailable while it is restricted.
                      </p>
                    )}
                  </div>
                  <div className="managed-content-actions">
                    {!item.restricted && (
                      <>
                        <Link className="text-link" to={editPath} state={state}>
                          Edit
                        </Link>
                        {item.status === "published" && (
                          <Link
                            className="text-link"
                            to={publicPath}
                            state={state}
                          >
                            View public
                          </Link>
                        )}
                        {item.kind === "work" && (
                          <>
                            {(item.status !== "published" ||
                              item.pendingChanges) && (
                              <button
                                className="text-link"
                                disabled={!!busy}
                                onClick={() => void act(item, "publish")}
                              >
                                {item.pendingChanges
                                  ? "Publish changes"
                                  : "Publish"}
                              </button>
                            )}
                            {item.status === "published" && (
                              <button
                                className="text-button"
                                disabled={!!busy}
                                onClick={() =>
                                  setConfirm({ item, action: "unpublish" })
                                }
                              >
                                Unpublish
                              </button>
                            )}
                          </>
                        )}
                      </>
                    )}
                    <button
                      className="text-button"
                      disabled={!!busy}
                      onClick={() => setConfirm({ item, action: "delete" })}
                    >
                      Delete
                    </button>
                    {busy === item.id && <span role="status">Saving…</span>}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <Empty title="No content here yet.">
            <p>
              {params.get("status") || params.get("type")
                ? "Try another filter or share something new."
                : "Your creations and updates will appear here, including anything your agents share."}
            </p>
            <Link className="text-link" state={state} to={newPath}>
              Share something →
            </Link>
          </Empty>
        ))}
      <LoadMore
        next={query.data?.nextCursor}
        busy={query.moreBusy}
        error={query.moreError}
        onClick={() => void query.more()}
      />
      {confirm && (
        <Dialog
          title={
            confirm.action === "delete"
              ? "Delete this content?"
              : "Unpublish this creation?"
          }
          onClose={() => !busy && setConfirm(null)}
        >
          <p>{confirm.item.title}</p>
          <p className="text-muted">
            {confirm.action === "delete"
              ? "This removes the content and its public discussion. It cannot be restored."
              : "Your creation stays in My content. You can publish it again later."}
          </p>
          {error && <Notice>{error}</Notice>}
          <div className="flex gap-3 mt-6">
            <button
              className="secondary"
              disabled={!!busy}
              onClick={() => setConfirm(null)}
            >
              Cancel
            </button>
            <button
              className="primary"
              disabled={!!busy}
              onClick={() => void act(confirm.item, confirm.action)}
            >
              {confirm.action === "delete" ? "Delete" : "Unpublish"}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
