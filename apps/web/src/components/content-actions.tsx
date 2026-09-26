import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ArrowDown,
  Heart,
  Bookmark,
  Share2,
  Copy,
} from "lucide-react";
import { useAuth } from "./auth";
import { useApi, errorMessage } from "./api";
import { Dialog } from "./ui";
import type {
  InteractionInput,
  InteractionKind,
  Interactions,
} from "../shared/interactions";

export function ContentActions(props: {
  kind: InteractionKind;
  id: string;
  initial: Interactions;
  path: string;
  onChange?: (value: Interactions) => void;
}) {
  const auth = useAuth();
  return (
    <Actions key={`${auth.userId}:${props.kind}:${props.id}`} {...props} />
  );
}
function Actions({
  kind,
  id,
  initial,
  path,
  onChange,
}: Parameters<typeof ContentActions>[0]) {
  const auth = useAuth(),
    api = useApi();
  const [value, setValue] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [failed, setFailed] = useState<InteractionInput | null>(null),
    [shareUrl, setShareUrl] = useState(""),
    [shareMessage, setShareMessage] = useState("");
  const active = useRef(true),
    pending = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    setValue(initial);
  }, [initial]);
  async function change(input: InteractionInput) {
    if (!auth.userId) {
      auth.login();
      return;
    }
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await api<Interactions>(
        `/${kind}s/${id}/interactions`,
        input,
        "PUT",
      );
      if (active.current) {
        setFailed(null);
        setValue(next);
        onChange?.(next);
      }
    } catch (e) {
      if (active.current) {
        setError(errorMessage(e));
        setFailed(input);
      }
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareMessage("Link copied.");
    } catch {
      setShareMessage("Copy the link from the field below.");
    }
  }
  async function share() {
    try {
      await navigator.share({ url: shareUrl });
      setShareUrl("");
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError"))
        setShareMessage(errorMessage(e));
    }
  }
  const disabled =
    busy ||
    !!failed ||
    !auth.ready ||
    !auth.configured ||
    (!!auth.userId && !value.viewer);
  return (
    <div className="content-actions-wrap">
      <div
        className="content-actions"
        role="group"
        aria-label="Content actions"
        aria-busy={busy}
      >
        <button
          type="button"
          disabled={disabled}
          aria-label="Upvote"
          aria-description={`${value.up} upvotes`}
          title="Upvote"
          aria-pressed={value.viewer?.vote === "up"}
          onClick={() =>
            void change({
              action: "vote",
              value: value.viewer?.vote === "up" ? null : "up",
            })
          }
        >
          <ArrowUp size={16} />
          <span>{value.up}</span>
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-label="Downvote"
          aria-description={`${value.down} downvotes`}
          title="Downvote"
          aria-pressed={value.viewer?.vote === "down"}
          onClick={() =>
            void change({
              action: "vote",
              value: value.viewer?.vote === "down" ? null : "down",
            })
          }
        >
          <ArrowDown size={16} />
          <span>{value.down}</span>
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-label="Like"
          aria-description={`${value.likes} likes`}
          title="Like"
          aria-pressed={value.viewer?.liked ?? false}
          onClick={() =>
            void change({ action: "like", value: !value.viewer?.liked })
          }
        >
          <Heart
            size={16}
            fill={value.viewer?.liked ? "currentColor" : "none"}
          />
          <span>{value.likes}</span>
        </button>
        <button
          type="button"
          disabled={disabled}
          aria-label="Save"
          title={value.viewer?.saved ? "Remove from saved" : "Save privately"}
          aria-pressed={value.viewer?.saved ?? false}
          onClick={() =>
            void change({ action: "save", value: !value.viewer?.saved })
          }
        >
          <Bookmark
            size={16}
            fill={value.viewer?.saved ? "currentColor" : "none"}
          />
          <span>{value.viewer?.saved ? "Saved" : "Save"}</span>
        </button>
        <button
          type="button"
          aria-label="Share"
          title="Share"
          onClick={() => {
            setShareMessage("");
            setShareUrl(new URL(path, window.location.origin).href);
          }}
        >
          <Share2 size={16} />
          <span>Share</span>
        </button>
      </div>
      {error && (
        <p className="action-error" role="alert">
          Action not confirmed. {error}{" "}
          <button
            className="text-link"
            type="button"
            disabled={busy}
            onClick={() => failed && void change(failed)}
          >
            Retry action
          </button>{" "}
          <button
            className="text-link"
            type="button"
            disabled={busy}
            onClick={() => window.location.reload()}
          >
            Reload to check
          </button>
        </p>
      )}
      {shareUrl && (
        <Dialog title="Share this content" onClose={() => setShareUrl("")}>
          <label className="field">
            Public link
            <input
              readOnly
              value={shareUrl}
              onFocus={(e) => e.target.select()}
            />
          </label>
          <div className="share-actions">
            <button
              className="primary"
              type="button"
              onClick={() => void copy()}
            >
              <Copy size={16} />
              Copy link
            </button>
            {typeof navigator !== "undefined" &&
              typeof navigator.share === "function" && (
                <button
                  className="secondary"
                  type="button"
                  onClick={() => void share()}
                >
                  <Share2 size={16} />
                  Share via…
                </button>
              )}
          </div>
          {shareMessage && (
            <p role="status" className="mt-3">
              {shareMessage}
            </p>
          )}
        </Dialog>
      )}
    </div>
  );
}
