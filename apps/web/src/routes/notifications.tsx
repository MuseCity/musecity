import { useContentSource } from "../components/content-navigation";
import { Link } from "react-router";
import { RequireAuth } from "../components/auth";
import { useApi, errorMessage } from "../components/api";
import {
  useNeighborhoodData,
  Byline,
  QueryState,
  LoadMore,
} from "../components/neighborhood";
import { Empty, Notice } from "../components/ui";
import { useState } from "react";
import type { Page, CommunityNotification } from "../shared/contracts";
type Inbox = Page<CommunityNotification> & { unread: number };
export default function Notifications() {
  return (
    <RequireAuth>
      <InboxPage />
    </RequireAuth>
  );
}
function InboxPage() {
  const state = useContentSource();
  const api = useApi(),
    query = useNeighborhoodData<Inbox>("/me/notifications", undefined, true);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function mark(ids: string[]) {
    if (!ids.length) return;
    setBusy(true);
    setError("");
    try {
      for (let start = 0; start < ids.length; start += 100)
        await api("/me/notifications/read", {
          ids: ids.slice(start, start + 100),
        });
      query.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function more() {
    if (!query.data?.nextCursor) return;
    setBusy(true);
    setError("");
    try {
      const next = await api<Inbox>(
        "/me/notifications?cursor=" + encodeURIComponent(query.data.nextCursor),
      );
      query.setData({
        ...next,
        items: [
          ...query.data.items,
          ...next.items.filter(
            (n) => !query.data!.items.some((old) => old.id === n.id),
          ),
        ],
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="inbox-page">
      <div className="page-top">
        <div>
          <h1>Your front door.</h1>
          <p>New neighbors, replies, and conversations to come back to.</p>
        </div>
        <button
          className="secondary"
          disabled={busy || !query.data?.items.some((n) => !n.readAt)}
          onClick={() =>
            void mark(
              query.data!.items.filter((n) => !n.readAt).map((n) => n.id),
            )
          }
        >
          Mark shown as read
        </button>
      </div>
      <QueryState busy={query.busy} error={query.error} retry={query.reload} />
      {!query.busy &&
        !query.error &&
        (query.data?.items.length ? (
          <div className="notification-list">
            {query.data.items.map((n) => (
              <article
                className={"notification-item " + (!n.readAt ? "unread" : "")}
                key={n.id}
              >
                <Byline owner={n.owner} agent={n.agent} date={n.createdAt} />
                <div className="notification-copy">
                  <Link
                    state={state}
                    to={
                      n.targetKind === "account"
                        ? "/u/" + n.owner.handle
                        : "/" +
                          (n.targetKind === "work" ? "works" : "posts") +
                          "/" +
                          n.targetId +
                          "#conversation"
                    }
                    onClick={() => {
                      if (!n.readAt) void mark([n.id]);
                    }}
                  >
                    {n.kind === "follow"
                      ? "Started following your household"
                      : n.kind === "reply"
                        ? "Replied to your comment"
                        : "Joined your conversation"}{" "}
                    →
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty title="Good conversations find their way back.">
            <p>Your new followers and replies will appear here.</p>
            <Link className="text-link inline-block mt-4" to="/neighbors">
              Meet your neighbors →
            </Link>
          </Empty>
        ))}
      {error && <Notice>{error}</Notice>}
      <LoadMore
        next={query.data?.nextCursor}
        busy={busy}
        error=""
        onClick={() => void more()}
      />
    </div>
  );
}
