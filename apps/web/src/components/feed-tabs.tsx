import { useTopics } from "./catalog";
import { useEffect, useRef, useState } from "react";
import { useRevalidator } from "react-router";
import {
  useFilterLocation,
  ContentFilterLink,
  useChangeContentFilter,
} from "./content-navigation";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Plus,
  SlidersHorizontal,
} from "lucide-react";
import {
  defaultTabs,
  maxFeedTabs,
  createTagSchema,
  type Topic,
} from "../shared/contracts";
import { useAuth } from "./auth";
import { useApi, errorMessage, request } from "./api";
import { Dialog, Notice } from "./ui";

export function FeedTabs() {
  const auth = useAuth();
  return <Tabs key={auth.userId ?? "visitor"} />;
}

function Tabs() {
  const topics = useTopics(),
    auth = useAuth(),
    api = useApi(),
    location = useFilterLocation(),
    revalidator = useRevalidator(),
    changeFilter = useChangeContentFilter();
  const [saved, setSaved] = useState<string[]>(defaultTabs);
  const [available, setAvailable] = useState<Topic[]>(topics);
  const [edit, setEdit] = useState<string[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const navigation = useRef<HTMLElement>(null);
  const label = (key: string) =>
    key === "latest"
      ? "Latest"
      : key === "following"
        ? "Following"
        : key === "sites"
          ? "Sites"
          : (available.find((t) => t.id === key.slice(4))?.name ??
            topics.find((t) => t.id === key.slice(4))?.name ??
            key.slice(4));
  useEffect(() => {
    let active = true;
    if (auth.userId)
      api<{ tabs: string[] }>("/me/feed-preferences")
        .then((value) => {
          if (active) setSaved(value.tabs);
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
  const active =
    params.get("view") === "sites"
      ? "sites"
      : params.get("tag")
        ? "tag:" + params.get("tag")
        : params.get("view") === "following"
          ? "following"
          : "latest";
  const tabs = saved.includes(active) ? saved : [...saved, active];
  useEffect(() => {
    const nav = navigation.current,
      selected = nav?.querySelector('[aria-current="page"]');
    if (!nav || !selected) return;
    const bounds = nav.getBoundingClientRect(),
      tab = selected.getBoundingClientRect();
    if (tab.left < bounds.left) nav.scrollLeft -= bounds.left - tab.left;
    else if (tab.right > bounds.right)
      nav.scrollLeft += tab.right - bounds.right;
  }, [active, saved]);

  async function open() {
    if (!auth.userId) {
      auth.login();
      return;
    }
    setError("");
    setMessage("");
    setBusy(true);
    setName("");
    try {
      const [preferences, catalog] = await Promise.all([
        api<{ tabs: string[] }>("/me/feed-preferences"),
        request<{ tags: Topic[] }>("/api/v1/tags"),
      ]);
      setAvailable(catalog.tags);
      setSaved(preferences.tabs);
      setEdit(preferences.tabs);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!edit) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ tabs: string[] }>(
        "/me/feed-preferences",
        { tabs: edit },
        "PUT",
      );
      setSaved(result.tabs);
      setEdit(null);
      if (!result.tabs.includes(active)) changeFilter("tab", "latest");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    if (!edit || edit.length >= maxFeedTabs) return;
    const parsed = createTagSchema.safeParse({ name });
    if (!parsed.success) {
      setError(parsed.error.issues.map((v) => v.message).join(" "));
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const tag = await api<Topic>("/tags", parsed.data);
      setAvailable((old) => [...old.filter((t) => t.id !== tag.id), tag]);
      setEdit((old) =>
        old && !old.includes("tag:" + tag.id) ? [...old, "tag:" + tag.id] : old,
      );
      setName("");
      setMessage(
        `${tag.name} is available to everyone. Save tabs to keep it on your homepage.`,
      );
      void revalidator.revalidate();
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
  const search = name
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
  const matches = available.filter((t) =>
    t.name.toLowerCase().includes(search),
  );
  const exact = available.some((t) => t.name.toLowerCase() === search);
  return (
    <>
      <div className="square-controls">
        <nav
          ref={navigation}
          aria-label="Main feed tabs"
          className="feed-view-tabs"
        >
          {tabs.map((key) => (
            <ContentFilterLink
              key={key}
              field="tab"
              value={key}
              className={active === key ? "active" : ""}
              aria-current={active === key ? "page" : undefined}
            >
              {label(key)}
            </ContentFilterLink>
          ))}
        </nav>
        <button
          className="manage-tabs"
          onClick={() => void open()}
          disabled={!auth.configured || busy}
          aria-label="Manage tabs"
        >
          {saved.length > defaultTabs.length ? (
            <SlidersHorizontal size={17} />
          ) : (
            <Plus size={17} />
          )}
          <span>
            {saved.length > defaultTabs.length ? "Manage tabs" : "Add tab"}
          </span>
        </button>
      </div>
      {error && !edit && <Notice>{error}</Notice>}
      {edit && (
        <Dialog
          title="Make this feed yours"
          onClose={() => !busy && setEdit(null)}
        >
          <p className="text-muted mb-5">
            Tags are shared spaces: anyone can publish to them. Your tab order
            only changes your homepage.
          </p>
          <fieldset className="feed-tab-settings" disabled={busy}>
            <div className="tab-order-list">
              {edit.map((key, i) => (
                <div className="tab-option" key={key}>
                  <span className="tab-option-name">{label(key)}</span>
                  {i < defaultTabs.length ? (
                    <span className="text-muted text-xs ml-auto">
                      Always on
                    </span>
                  ) : (
                    <div className="ml-auto flex items-center gap-1">
                      <button
                        className="icon-button"
                        aria-label={"Move " + label(key) + " up"}
                        disabled={i === defaultTabs.length}
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
                        aria-label={"Hide " + label(key)}
                        onClick={() => setEdit(edit.filter((t) => t !== key))}
                      >
                        Hide
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <label className="field mt-6">
              Find or create a tag
              <input
                value={name}
                maxLength={40}
                onChange={(e) => {
                  setName(e.target.value);
                  setError("");
                  setMessage("");
                }}
                placeholder="e.g. Photography, Music, 城市生活"
              />
            </label>
            <div className="tag-catalog mt-3">
              {matches.map((tag) => {
                const key = "tag:" + tag.id,
                  chosen = edit.includes(key);
                return (
                  <button
                    className={"chip " + (chosen ? "chosen" : "")}
                    key={key}
                    disabled={chosen || edit.length >= maxFeedTabs}
                    onClick={() => setEdit([...edit, key])}
                  >
                    {chosen ? <Check size={13} /> : <Plus size={13} />}
                    {tag.name}
                  </button>
                );
              })}
            </div>
            {search && !exact && (
              <button
                className="secondary mt-3"
                disabled={edit.length >= maxFeedTabs}
                onClick={() => void create()}
              >
                <Plus size={15} />
                Create shared tag
              </button>
            )}
            {edit.length >= maxFeedTabs && (
              <p className="field-note mt-3">
                Your homepage has {maxFeedTabs} tabs. Hide a tag to add another.
              </p>
            )}
            {message && (
              <p role="status" className="field-note mt-3">
                {message}
              </p>
            )}
            {error && <Notice>{error}</Notice>}
            <div className="feed-tab-actions">
              <button
                className="text-button"
                onClick={() => setEdit([...defaultTabs])}
              >
                Restore defaults
              </button>
              <button className="primary" onClick={() => void save()}>
                {busy ? "Saving…" : "Save tabs"}
              </button>
            </div>
          </fieldset>
        </Dialog>
      )}
    </>
  );
}
