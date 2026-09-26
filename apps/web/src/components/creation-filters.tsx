import { useTopics } from "./catalog";
import { useEffect, useState } from "react";
import { useFilterLocation, ContentFilterLink } from "./content-navigation";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Plus,
  SlidersHorizontal,
  Globe,
  Video,
  Image as ImageIcon,
  Layers,
  FileText,
} from "lucide-react";
import {
  defaultTabs,
  typeLabels,
  workTypes,
  type WorkType,
} from "../shared/contracts";
import { useAuth } from "./auth";
import { useApi, errorMessage } from "./api";
import { Dialog, Notice } from "./ui";
export const tabLabel = (
  key: string,
  topics: { id: string; name: string }[] = [],
) =>
  key === "all"
    ? "All"
    : key.startsWith("type:")
      ? typeLabels[key.slice(5) as WorkType]
      : (topics.find((t) => t.id === key.slice(4))?.name ?? key);
const icons = {
  all: Layers,
  website: Globe,
  video: Video,
  image: ImageIcon,
  article: FileText,
};
export function CreationFilters() {
  const topics = useTopics(),
    label = (key: string) => tabLabel(key, topics),
    auth = useAuth(),
    api = useApi(),
    location = useFilterLocation();
  const [saved, setSaved] = useState<{ userId: string; tabs: string[] } | null>(
    null,
  );
  const [edit, setEdit] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tabs = saved?.userId === auth.userId ? saved.tabs : defaultTabs;
  useEffect(() => {
    let active = true;
    setSaved(null);
    setEdit(null);
    setError("");
    if (auth.userId)
      api<{ tabs: string[] }>("/me/feed-preferences")
        .then((v) => {
          if (active) setSaved({ userId: auth.userId!, tabs: v.tabs });
        })
        .catch(() => {
          if (active)
            setError("Your tabs could not sync. Open Manage tabs to retry.");
        });
    return () => {
      active = false;
    };
  }, [auth.userId, api]);
  const params = new URLSearchParams(location.search);
  const active = params.get("type")
    ? "type:" + params.get("type")
    : params.get("tag")
      ? "tag:" + params.get("tag")
      : "all";
  async function save() {
    if (!edit || !auth.userId) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ tabs: string[] }>(
        "/me/feed-preferences",
        { tabs: edit },
        "PUT",
      );
      setSaved({ userId: auth.userId, tabs: result.tabs });
      setEdit(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function move(index: number, offset: number) {
    if (!edit) return;
    const next = [...edit];
    [next[index], next[index + offset]] = [next[index + offset]!, next[index]!];
    setEdit(next);
  }
  return (
    <>
      <div className="nav-row work-filter-row creation-filter-row">
        <nav aria-label="Creation formats and topics" className="tabs">
          {(tabs.includes(active) ? tabs : [...tabs, active]).map((key) => {
            const Icon =
              icons[
                (key === "all" ? "all" : key.slice(5)) as keyof typeof icons
              ];
            return (
              <ContentFilterLink
                key={key}
                field={key.startsWith("tag:") ? "tag" : "type"}
                value={
                  key === "all" ? "" : key.slice(key.startsWith("tag:") ? 4 : 5)
                }
                aria-current={key === active ? "page" : undefined}
                className={"tab " + (key === active ? "selected" : "")}
              >
                {Icon && <Icon size={15} />}
                <span>{label(key)}</span>
              </ContentFilterLink>
            );
          })}
        </nav>
        <button
          className="manage-tabs"
          onClick={async () => {
            if (!auth.userId) {
              auth.login();
              return;
            }
            setError("");
            setBusy(true);
            try {
              setEdit(
                (await api<{ tabs: string[] }>("/me/feed-preferences")).tabs,
              );
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
          disabled={!auth.configured || busy}
          aria-label="Manage tabs"
        >
          <SlidersHorizontal size={16} />
          <span>Manage tabs</span>
        </button>
      </div>
      {error && !edit && (
        <div className="shell">
          <Notice>{error}</Notice>
        </div>
      )}
      {edit && (
        <Dialog
          title="Make this feed yours"
          onClose={() => !busy && setEdit(null)}
        >
          <p className="text-muted mb-6">
            Choose creation formats and topics. Your tabs sync across devices.
          </p>
          <div className="space-y-1">
            {edit.map((key, i) => (
              <div className="tab-option" key={key}>
                <span>{label(key)}</span>
                {i === 0 ? (
                  <span className="text-muted text-xs ml-auto">Always on</span>
                ) : (
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      className="icon-button"
                      aria-label={"Move " + label(key) + " up"}
                      disabled={i === 1}
                      onClick={() => move(i, -1)}
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={"Move " + label(key) + " down"}
                      disabled={i === edit.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      <ArrowDown size={15} />
                    </button>
                    <button
                      className="text-button"
                      onClick={() => setEdit(edit.filter((t) => t !== key))}
                    >
                      Hide
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <h3 className="mt-7 mb-3">Add to your tabs</h3>
          <div className="flex flex-wrap gap-2">
            {[
              ...workTypes.map((t) => "type:" + t),
              ...topics.map((t) => "tag:" + t.id),
            ].map((key) => (
              <button
                className={"chip " + (edit.includes(key) ? "chosen" : "")}
                key={key}
                disabled={edit.includes(key) || edit.length >= 20}
                onClick={() => setEdit([...edit, key])}
              >
                {edit.includes(key) ? <Check size={13} /> : <Plus size={13} />}{" "}
                {label(key)}
              </button>
            ))}
          </div>
          {error && <Notice>{error}</Notice>}
          <div className="flex items-center justify-between mt-8">
            <button
              className="text-button"
              onClick={() => setEdit([...defaultTabs])}
            >
              Restore defaults
            </button>
            <button
              className="primary"
              onClick={() => void save()}
              disabled={busy}
            >
              {busy ? "Saving…" : "Save tabs"}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
