import { Link, useLocation } from "react-router";
import { ContentActions } from "./content-actions";
import { useEffect, useState } from "react";
import { useAuth } from "./auth";
import { useApi, errorMessage } from "./api";
import {
  useNeighborhoodPage,
  useNeighborhoodData,
  Byline,
  QueryState,
  ReportButton,
  LoadMore,
} from "./neighborhood";
import { Empty, Notice, Dialog } from "./ui";
import type { CommentView, Profile } from "../shared/contracts";
export function Conversation({
  kind,
  id,
}: {
  kind: "work" | "post";
  id: string;
}) {
  const location = useLocation(),
    focus = new URLSearchParams(location.search).get("comment");
  const auth = useAuth(),
    api = useApi(),
    query = useNeighborhoodPage<CommentView>(
      "/" +
        kind +
        "s/" +
        id +
        "/comments" +
        (focus ? "?focus=" + encodeURIComponent(focus) : ""),
    ),
    me = useNeighborhoodData<Profile>("/me", undefined, true);
  const [text, setText] = useState(""),
    [parent, setParent] = useState<CommentView | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [deleting, setDeleting] = useState<string | null>(null);
  const focusVisible =
    !!focus && !!query.data?.items.some((c) => c.id === focus);
  useEffect(() => {
    if (focusVisible)
      document
        .getElementById("comment-" + focus)
        ?.scrollIntoView({ block: "center" });
  }, [focus, focusVisible]);
  useEffect(() => {
    if (!text) return;
    const leave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, [text]);
  async function send() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api("/" + kind + "s/" + id + "/comments", {
        text,
        parentId: parent?.id,
      });
      setText("");
      setParent(null);
      query.reload();
      setMessage("Your reply has been shared.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api("/comments/" + deleting, undefined, "DELETE");
      setDeleting(null);
      query.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section id="conversation" className="conversation">
      <div className="section-heading">
        <h2>Conversation</h2>
        <span>Say hello. Lend a hand.</span>
      </div>
      {focus && (
        <Link
          className="text-link"
          to={"/" + kind + "s/" + id + "#conversation"}
          state={location.state}
        >
          View full conversation
        </Link>
      )}
      <QueryState busy={query.busy} error={query.error} retry={query.reload} />
      {!query.busy && !query.error && (
        <>
          {query.data?.items.length ? (
            <div className="comment-list">
              {query.data.items.map((c) => (
                <article
                  className={"comment " + (c.parentId ? "is-reply" : "")}
                  id={"comment-" + c.id}
                  key={c.id}
                >
                  {c.parentId && (
                    <p className="reply-context">
                      Replying to{" "}
                      {query.data?.items.find((p) => p.id === c.parentId)?.owner
                        .name ?? "an earlier comment"}
                    </p>
                  )}
                  <Byline owner={c.owner} agent={c.agent} date={c.createdAt} />
                  <p
                    className={
                      "comment-text " + (c.deleted ? "text-muted" : "")
                    }
                  >
                    {c.deleted ? "This reply was removed." : c.text}
                  </p>
                  {!c.deleted && (
                    <div className="comment-actions">
                      <ContentActions
                        kind="comment"
                        id={c.id}
                        initial={c.interactions}
                        path={
                          "/" +
                          kind +
                          "s/" +
                          id +
                          "?comment=" +
                          c.id +
                          "#comment-" +
                          c.id
                        }
                      />
                      <button
                        className="text-link"
                        onClick={() => {
                          if (!auth.userId) {
                            auth.login();
                            return;
                          }
                          setParent(c);
                          setMessage("");
                          document.getElementById("reply-text")?.focus();
                        }}
                      >
                        Reply
                      </button>
                      {me.data?.id === c.owner.id ? (
                        <button
                          className="text-button"
                          onClick={() => setDeleting(c.id)}
                        >
                          Delete
                        </button>
                      ) : (
                        <ReportButton kind="comment" id={c.id} />
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <Empty title="Be the first to say hello." />
          )}
          <LoadMore
            next={query.data?.nextCursor}
            busy={query.moreBusy}
            error={query.moreError}
            onClick={() => void query.more()}
          />
          {auth.userId ? (
            <div className="reply-composer">
              {parent && (
                <div className="reply-context flex justify-between">
                  <span>Replying to {parent.owner.name}</span>
                  <button className="text-link" onClick={() => setParent(null)}>
                    Cancel reply
                  </button>
                </div>
              )}
              <label className="field">
                Your reply
                <textarea
                  id="reply-text"
                  rows={3}
                  value={text}
                  maxLength={2000}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Share a thought or offer a little help…"
                />
              </label>
              <button
                className="primary mt-3"
                disabled={busy || !text.trim()}
                onClick={() => void send()}
              >
                {busy ? "Sending…" : "Send reply"}
              </button>
            </div>
          ) : (
            <button
              className="secondary mt-5"
              disabled={!auth.configured}
              onClick={auth.login}
            >
              Join the conversation
            </button>
          )}
        </>
      )}
      {error && <Notice>{error}</Notice>}
      {message && (
        <p className="success-message" role="status">
          {message}
        </p>
      )}
      {deleting && (
        <Dialog
          title="Remove this reply?"
          onClose={() => !busy && setDeleting(null)}
        >
          <p>
            Your reply text will be removed. Responses from other neighbors will
            remain.
          </p>
          <button
            className="primary mt-5"
            disabled={busy}
            onClick={() => void remove()}
          >
            Remove reply
          </button>
        </Dialog>
      )}
    </section>
  );
}
