import {
  ContentBack,
  ShareOptions,
  useContentSource,
  useContentReturn,
} from "../components/content-navigation";
import { useTopics } from "../components/catalog";
import { useNeighborhoodData } from "../components/neighborhood";
import { OriginalityBadge, WebsiteMarker } from "../components/originality";
import {
  originalityReasons,
  type OriginalityCheck,
} from "../shared/originality";
import { TopicPicker } from "../components/topic-picker";
import { useEffect, useState } from "react";
import {
  Link,
  useNavigate,
  useLocation,
  useParams,
  useBeforeUnload,
  useBlocker,
} from "react-router";
import { Globe, Video, Image as ImageIcon, FileText, X } from "lucide-react";
import { RequireAuth } from "../components/auth";
import { useApi, errorMessage } from "../components/api";
import {
  type WorkView,
  type OwnProfile,
  type WorkContent,
  type WorkType,
  type ArticleNode,
  workSchema,
} from "../shared/contracts";
import { Notice, Dialog } from "../components/ui";
import { UploadImage } from "../components/upload";
import { MediaImage } from "../components/media-image";
import { ArticleEditor } from "../components/article-editor";
import { WorkBody } from "../components/work-detail";
import { siteBuilder } from "../shared/site-builders";
const emptyDocument: ArticleNode = {
  type: "doc",
  content: [{ type: "paragraph" }],
};
const blank: WorkContent = {
  type: "website",
  title: "",
  description: "",
  aiTools: [],
  tagIds: [],
  websiteUrl: "",
};
export default function EditorPage() {
  const { id } = useParams();
  const location = useLocation();
  return (
    <RequireAuth>
      <Editor key={id ?? "new" + location.search} id={id} />
    </RequireAuth>
  );
}
function Editor({ id }: { id?: string }) {
  const topics = useTopics();
  const api = useApi();
  const me = useNeighborhoodData<OwnProfile>("/me", undefined, true);
  const navigate = useNavigate();
  const location = useLocation();
  const siteEntry =
    !id && new URLSearchParams(location.search).get("from") === "sites";
  const builder = siteEntry
    ? siteBuilder(new URLSearchParams(location.search).get("builder"))
    : undefined;
  const state = useContentSource();
  const back = useContentReturn("/me/content?kind=work");
  const [body, setBody] = useState<WorkContent>(() => ({
    ...blank,
    ...(siteEntry ? { aiDeclaration: true } : {}),
    ...(builder ? { aiTools: [builder.tool] } : {}),
    tagIds: topics
      .filter((t) => t.id === new URLSearchParams(location.search).get("tag"))
      .map((t) => t.id),
  }));
  const [saved, setSaved] = useState<WorkView | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [confirm, setConfirm] = useState<"unpublish" | "delete" | null>(null);
  const [message, setMessage] = useState<string>(
    location.state?.draftSaved
      ? "Draft saved. Find it in My content → Creations → Draft. These changes are private until you publish."
      : "",
  );
  const [dirty, setDirty] = useState(false);
  useBeforeUnload((e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  const blocker = useBlocker(dirty && !busy);
  async function load() {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const work = await api<WorkView>("/works/" + id + "?draft=true");
      setSaved(work);
      setBody(work.body);
      setDirty(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [id]);
  const update = (patch: Partial<WorkContent>) => {
    setBody((v) => ({ ...v, ...patch }));
    setDirty(true);
    setMessage("");
  };
  function changeType(type: WorkType) {
    if (type === body.type) return;
    if (
      dirty &&
      !window.confirm(
        "Changing format removes the current URL, images, or article body. Continue?",
      )
    )
      return;
    const {
      websiteUrl: _w,
      videoUrl: _v,
      imageMediaIds: _i,
      articleDocument: _a,
      ...rest
    } = body;
    setBody({
      ...rest,
      type,
      ...(type === "website"
        ? { websiteUrl: "" }
        : type === "video"
          ? { videoUrl: "" }
          : type === "image"
            ? { imageMediaIds: [] }
            : { articleDocument: emptyDocument }),
    });
    setDirty(true);
  }
  async function save(publish: boolean) {
    setError("");
    setMessage("");
    if (publish && siteEntry && body.aiDeclaration !== true) {
      setError("Choose ‘AI helped create this’ to publish in Sites.");
      return;
    }
    const parsed = workSchema.safeParse({
      ...body,
      aiTools: body.aiTools.map((t) => t.trim()).filter(Boolean),
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((v) => v.message).join(". "));
      return;
    }
    setBusy(true);
    try {
      let work = saved;
      if (!work || dirty)
        work = await api<WorkView>(
          work ? "/works/" + work.workId : "/works",
          work
            ? { baseRevisionId: work.revisionId, content: parsed.data }
            : parsed.data,
          work ? "PATCH" : "POST",
        );
      setSaved(work);
      setBody(work.body);
      setDirty(false);
      if (publish) {
        work = await api<WorkView>("/works/" + work.workId + "/publish", {
          revisionId: work.revisionId,
        });
        setSaved(work);
        void navigate("/works/" + work.workId, { replace: true, state });
      } else
        setMessage(
          "Draft saved. Find it in My content → Creations. These changes are private until you publish.",
        );
      if (!publish && !id)
        void navigate("/me/works/" + work.workId + "/edit", {
          replace: true,
          state: { ...state, draftSaved: true },
        });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function lifecycle() {
    if (!saved || !confirm) return;
    setBusy(true);
    setError("");
    try {
      if (confirm === "delete") {
        await api("/works/" + saved.workId, undefined, "DELETE");
        setDirty(false);
        back.go();
      } else {
        const next = await api<WorkView>(
          "/works/" + saved.workId + "/unpublish",
          { revisionId: saved.revisionId },
        );
        setSaved(next);
        setMessage("This creation is no longer public.");
      }
      setConfirm(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function verifyOriginality(publicVersion = false) {
    if (!saved || busy || (!publicVersion && dirty)) return;
    const revisionId = publicVersion
      ? saved.publishedRevisionId
      : saved.revisionId;
    if (!revisionId) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api<{
        revisionId: string;
        check: OriginalityCheck;
        work: WorkView;
      }>("/works/" + saved.workId + "/verify-originality", { revisionId });
      if (revisionId === saved.revisionId)
        setSaved({ ...result.work, originalityCheck: result.check });
      setMessage(
        (publicVersion ? "Public version: " : "Saved draft: ") +
          (result.check.status === "verified"
            ? "Creator marker verified. Originality is the creator’s declaration."
            : originalityReasons[result.check.reason!]),
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <div className="state" role="status">
        Loading draft…
      </div>
    );
  if (id && !saved)
    return (
      <div className="state">
        <Notice>{error}</Notice>
        <button className="secondary" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  if (saved?.restricted)
    return (
      <div className="composer-page">
        <ContentBack fallback="/me/content?kind=work" />
        <h1>{saved.body.title}</h1>
        <Notice>
          This creation is hidden by moderation. Editing and publishing are
          unavailable while it is restricted.
        </Notice>
      </div>
    );
  return (
    <div className="max-w-[760px] mx-auto">
      <div className="page-top">
        <div>
          <ContentBack fallback="/me/content?kind=work" />
          <h1 className="mt-3">
            {saved
              ? "Your creation"
              : siteEntry
                ? "Share your AI-built website."
                : "Share something you made."}
          </h1>
          <p>
            {saved?.status === "published"
              ? "Changes stay private until you publish again."
              : siteEntry
                ? builder
                  ? `Share what you built with ${builder.name}. Add a link, a cover and your build notes.`
                  : "Add your website link, a cover, and how you built it."
                : "A small idea can make someone’s day."}
          </p>
        </div>
        {saved && <span className="status-chip">{saved.status}</span>}
      </div>
      {!id && !siteEntry && <ShareOptions kind="work" />}
      {builder && (
        <p className="text-muted text-sm mb-5">
          {builder.access}{" "}
          <Link className="text-link" to={builder.guidePath}>
            Sharing guide →
          </Link>
        </p>
      )}
      {saved?.restricted && (
        <Notice>
          This creation is hidden by moderation. Editing and publishing are
          unavailable while it is restricted.
        </Notice>
      )}
      <fieldset disabled={busy || !!saved?.restricted} className="form-stack">
        {!siteEntry && (
          <div className="type-picker">
            {(
              [
                ["website", Globe, "Website"],
                ["video", Video, "Video"],
                ["image", ImageIcon, "Images"],
                ["article", FileText, "Article"],
              ] as const
            ).map(([type, Icon, label]) => (
              <button
                key={type}
                className={body.type === type ? "active" : ""}
                onClick={() => changeType(type)}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>
        )}
        <label className="field">
          Title
          <input
            maxLength={120}
            value={body.title}
            onChange={(e) => update({ title: e.target.value })}
            placeholder="Give your creation a name"
          />
        </label>
        <label className="field">
          Short description
          <textarea
            rows={3}
            maxLength={5000}
            value={body.description}
            onChange={(e) => update({ description: e.target.value })}
            placeholder="What did you make? What makes it interesting?"
          />
        </label>
        {body.type === "website" && (
          <label className="field">
            Website URL
            <input
              type="url"
              value={body.websiteUrl ?? ""}
              placeholder="https://"
              onChange={(e) => update({ websiteUrl: e.target.value })}
            />
          </label>
        )}
        {body.type === "website" && (
          <section
            className="panel space-y-4"
            aria-label="Original website verification"
          >
            <h2>Original website marker</h2>
            {me.data && <WebsiteMarker marker={me.data.websiteMarker} />}
            {me.error && (
              <Notice>
                {me.error}{" "}
                <button type="button" className="text-link" onClick={me.reload}>
                  Retry loading marker
                </button>
              </Notice>
            )}
            {saved?.body.type === "website" && (
              <>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span>Saved draft:</span>
                  {saved.originality ? (
                    <OriginalityBadge originality={saved.originality} />
                  ) : (
                    <span className="text-muted">No verified marker</span>
                  )}
                </div>
                {saved.originalityCheck?.reason && (
                  <p className="field-note">
                    {originalityReasons[saved.originalityCheck.reason]}
                  </p>
                )}
              </>
            )}
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="secondary"
                disabled={busy || dirty || !saved}
                onClick={() => void verifyOriginality()}
              >
                Verify website
              </button>
              {saved?.publishedRevisionId &&
                saved.publishedRevisionId !== saved.revisionId && (
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={() => void verifyOriginality(true)}
                  >
                    Recheck public version
                  </button>
                )}
            </div>
            {(!saved || dirty) && (
              <p className="field-note">
                Save your draft before checking its marker.
              </p>
            )}
            <p className="field-note">
              You can publish without a verified marker. Verification records
              the creator’s declaration at the time of the check.
            </p>
          </section>
        )}
        {body.type === "video" && (
          <label className="field">
            Video URL
            <input
              type="url"
              value={body.videoUrl ?? ""}
              placeholder="https://youtube.com/watch…"
              onChange={(e) => update({ videoUrl: e.target.value })}
            />
            <span className="field-note">
              Link to your video on its original platform.
            </span>
          </label>
        )}
        {body.type === "article" && (
          <div>
            <label className="field mb-2">Article</label>
            <ArticleEditor
              value={body.articleDocument ?? emptyDocument}
              onChange={(articleDocument) => update({ articleDocument })}
            />
          </div>
        )}
        {body.type === "image" ? (
          <div>
            <div className="photo-grid mb-3">
              {body.imageMediaIds?.map((mediaId, i) => (
                <div key={mediaId} className="relative">
                  <MediaImage id={mediaId} privateImage />
                  <button
                    className="absolute right-1 top-1 icon-button bg-white"
                    aria-label={"Remove image " + (i + 1)}
                    onClick={() =>
                      update({
                        imageMediaIds: body.imageMediaIds?.filter(
                          (v) => v !== mediaId,
                        ),
                      })
                    }
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            {(body.imageMediaIds?.length ?? 0) < 9 && (
              <UploadImage
                label="Add images (up to 9)"
                multiple
                onUpload={(ids) =>
                  update({
                    imageMediaIds: [
                      ...(body.imageMediaIds ?? []),
                      ...ids,
                    ].slice(0, 9),
                  })
                }
              />
            )}
          </div>
        ) : (
          <div>
            <div className="flex justify-between mb-2">
              <label className="field">
                Cover image{" "}
                <span className="field-note">
                  {body.type === "article" ? "Optional" : "Required to publish"}
                </span>
              </label>
              {body.coverMediaId && (
                <button
                  className="text-button"
                  onClick={() => update({ coverMediaId: undefined })}
                >
                  Remove
                </button>
              )}
            </div>
            {body.coverMediaId ? (
              <MediaImage
                id={body.coverMediaId}
                privateImage
                className="w-full max-h-60 object-contain rounded-lg mb-3"
              />
            ) : (
              <UploadImage
                label="Add a cover"
                onUpload={(ids) => update({ coverMediaId: ids[0] })}
              />
            )}
          </div>
        )}
        <TopicPicker
          value={body.tagIds}
          onChange={(tagIds) => update({ tagIds })}
        />
        <label className="field">
          Made with{" "}
          <span className="field-note">
            Optional · tools separated by commas
          </span>
          <input
            value={body.aiTools.join(",")}
            onChange={(e) => update({ aiTools: e.target.value.split(",") })}
            placeholder="Claude, Midjourney, …"
          />
        </label>
        <label className="field">
          AI use{" "}
          <span className="field-note">
            {siteEntry
              ? "Your own declaration · required for Sites"
              : "Optional · your own declaration"}
          </span>
          <select
            value={
              body.aiDeclaration === undefined ? "" : String(body.aiDeclaration)
            }
            onChange={(e) =>
              update({
                aiDeclaration:
                  e.target.value === "" ? undefined : e.target.value === "true",
              })
            }
          >
            <option value="">Not specified</option>
            <option value="true">AI helped create this</option>
            <option value="false">Created without AI</option>
          </select>
        </label>
      </fieldset>
      {error && <Notice>{error}</Notice>}
      {message && (
        <p
          className="bg-emerald-50 text-emerald-800 p-3 rounded-lg text-sm mt-5"
          role="status"
        >
          {message}
        </p>
      )}
      <div className="editor-actions">
        <button
          className="primary"
          disabled={busy || !!saved?.restricted}
          onClick={() => void save(true)}
        >
          {busy
            ? "Saving…"
            : saved?.status === "published"
              ? "Publish changes"
              : "Publish creation"}
        </button>
        <button
          className="secondary"
          disabled={busy || !!saved?.restricted}
          onClick={() => void save(false)}
        >
          Save draft
        </button>
        <button className="text-button" onClick={() => setPreview(true)}>
          Preview
        </button>
        {saved?.status === "published" && !saved.restricted && (
          <Link
            state={state}
            className="text-link ml-auto"
            to={"/works/" + saved.workId}
          >
            View public ↗
          </Link>
        )}
      </div>
      {saved && (
        <div className="flex gap-5 mt-5">
          <button
            className="text-button"
            disabled={
              busy || !!saved.restricted || saved.status !== "published"
            }
            onClick={() => setConfirm("unpublish")}
          >
            Unpublish
          </button>
          <button
            className="text-button !text-red-600"
            disabled={busy}
            onClick={() => setConfirm("delete")}
          >
            Delete creation
          </button>
        </div>
      )}
      {preview && (
        <Dialog title="Draft preview" onClose={() => setPreview(false)}>
          <h1>{body.title || "Untitled creation"}</h1>
          <WorkBody body={body} privateImages />
        </Dialog>
      )}
      {confirm && (
        <Dialog
          title={
            confirm === "delete"
              ? "Delete this creation?"
              : "Take this creation offline?"
          }
          onClose={() => !busy && setConfirm(null)}
        >
          <p className="text-muted">
            {confirm === "delete"
              ? "This removes the creation from your account and the public feed. It cannot be published again."
              : "Your draft stays in your account. You can publish it again later."}
          </p>
          <div className="flex justify-end gap-3 mt-6">
            <button
              className="secondary"
              onClick={() => setConfirm(null)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void lifecycle()}
            >
              {confirm === "delete" ? "Delete" : "Unpublish"}
            </button>
          </div>
        </Dialog>
      )}
      {blocker.state === "blocked" && (
        <Dialog title="Leave unsaved changes?" onClose={() => blocker.reset()}>
          <p className="text-muted">Your latest edits have not been saved.</p>
          <div className="flex justify-end gap-3 mt-6">
            <button className="secondary" onClick={() => blocker.reset()}>
              Keep editing
            </button>
            <button className="primary" onClick={() => blocker.proceed()}>
              Leave page
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
