import { ContentBack, useContentSource } from "./content-navigation";
import { useState } from "react";
import { useNavigate, useBlocker, useBeforeUnload } from "react-router";
import { UploadImage } from "./upload";
import { MediaImage } from "./media-image";
import { Notice, Dialog } from "./ui";
import { useApi, errorMessage } from "./api";
import {
  postSchema,
  type PostContent,
  type PostView,
} from "../shared/contracts";
export function PostEditor({
  kind = "update",
  existing,
  onSaved,
  onCancel,
}: {
  kind?: "update" | "help";
  existing?: PostView;
  onSaved?: (p: PostView) => void;
  onCancel?: () => void;
}) {
  const api = useApi(),
    navigate = useNavigate(),
    state = useContentSource();
  const [body, setBody] = useState<PostContent>(
    existing
      ? {
          kind: existing.kind,
          text: existing.text,
          title: existing.title,
          expectedOutcome: existing.expectedOutcome,
          mediaIds: existing.mediaIds,
        }
      : { kind, text: "", title: "", expectedOutcome: "", mediaIds: [] },
  );
  const [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(false);
  const blocker = useBlocker(dirty && !busy);
  useBeforeUnload((e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  function update(patch: Partial<PostContent>) {
    setBody((v) => ({ ...v, ...patch }));
    setDirty(true);
  }
  async function save() {
    setError("");
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      setError(parsed.error.issues.map((v) => v.message).join(" "));
      return;
    }
    setBusy(true);
    try {
      const p = await api<PostView>(
        existing ? "/posts/" + existing.id : "/posts",
        existing
          ? { revision: existing.revision, content: parsed.data }
          : parsed.data,
        existing ? "PATCH" : "POST",
      );
      setDirty(false);
      if (onSaved) onSaved(p);
      else void navigate("/posts/" + p.id, { replace: true, state });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="form-stack">
        {body.kind === "help" && (
          <label className="field">
            What do you need a hand with?
            <input
              value={body.title}
              maxLength={120}
              onChange={(e) => update({ title: e.target.value })}
              placeholder="A second pair of eyes on my new app"
            />
          </label>
        )}
        <label className="field">
          {body.kind === "help"
            ? "Tell your neighbors more"
            : "What’s happening?"}
          <textarea
            rows={6}
            maxLength={5000}
            value={body.text}
            onChange={(e) => update({ text: e.target.value })}
            placeholder={
              body.kind === "help"
                ? "Share the context, what you have tried, and where you need help."
                : "An idea, a small win, something you’re working on…"
            }
          />
          <span className="field-note">{body.text.length}/5,000</span>
        </label>
        {body.kind === "help" && (
          <label className="field">
            What would a good outcome look like?
            <textarea
              rows={2}
              value={body.expectedOutcome}
              maxLength={1000}
              onChange={(e) => update({ expectedOutcome: e.target.value })}
              placeholder="A few specific suggestions I can put into practice"
            />
          </label>
        )}
        {body.mediaIds.length > 0 && (
          <div className="post-editor-images">
            {body.mediaIds.map((id, i) => (
              <div key={id}>
                <MediaImage
                  variant="feed"
                  id={id}
                  privateImage
                  alt={"Attached image " + (i + 1)}
                />
                <button
                  className="text-button"
                  disabled={busy || uploading}
                  onClick={() =>
                    update({ mediaIds: body.mediaIds.filter((v) => v !== id) })
                  }
                >
                  Remove image {i + 1}
                </button>
              </div>
            ))}
          </div>
        )}
        {body.mediaIds.length < 9 && (
          <UploadImage
            label="Add photos"
            multiple
            onBusyChange={setUploading}
            onUpload={(ids) => {
              if (ids.length + body.mediaIds.length > 9) {
                setError("Choose up to 9 images in total.");
                return;
              }
              update({ mediaIds: [...body.mediaIds, ...ids] });
            }}
          />
        )}
        <p className="text-muted text-xs">
          {existing
            ? "Saving changes updates the public content immediately."
            : "Publishes immediately under your name. No draft is saved."}{" "}
          Up to 9 photos.
        </p>
      </div>
      {error && (
        <Notice>
          {error}
          {error.includes("Reload") && existing && onCancel && (
            <button className="text-link ml-2" onClick={onCancel}>
              Reload post
            </button>
          )}
        </Notice>
      )}
      <div className="flex gap-4 items-center mt-6">
        <button
          className="primary"
          disabled={busy || uploading || !body.text.trim()}
          onClick={() => void save()}
        >
          {busy
            ? "Sharing…"
            : existing
              ? "Save changes"
              : body.kind === "help"
                ? "Ask musecity"
                : "Share update"}
        </button>
        {onCancel ? (
          <button
            className="text-button"
            disabled={busy || uploading}
            onClick={() => {
              if (!dirty || window.confirm("Discard your unsaved changes?"))
                onCancel();
            }}
          >
            Cancel
          </button>
        ) : (
          <ContentBack />
        )}
      </div>
      {blocker.state === "blocked" && (
        <Dialog title="Leave without sharing?" onClose={() => blocker.reset()}>
          <p>Your unsaved changes will be lost.</p>
          <div className="flex gap-3 mt-6">
            <button className="secondary" onClick={() => blocker.reset()}>
              Keep editing
            </button>
            <button className="primary" onClick={() => blocker.proceed()}>
              Discard changes
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
