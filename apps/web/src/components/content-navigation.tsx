import { Link, useLocation, useNavigate, useNavigation } from "react-router";
import {
  contentHref,
  contentKind,
  contentKinds,
  validOrigin,
  shareHref,
} from "../shared/content-navigation";
import { workTypes, typeLabels } from "../shared/contracts";
import { MessageCircle, Handshake, Sparkles } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";

type FilterIntent = { path: string; search: string } | null;
const FilterContext = createContext<RefObject<FilterIntent> | null>(null);
export function ContentNavigationProvider({
  children,
}: {
  children: ReactNode;
}) {
  const intent = useRef<FilterIntent>(null),
    location = useLocation();
  useEffect(() => {
    intent.current = null;
  }, [location.key]);
  return <FilterContext value={intent}>{children}</FilterContext>;
}
export function useChangeContentFilter() {
  const intent = useContext(FilterContext),
    location = useLocation(),
    navigate = useNavigate();
  return (key: string, value: string) => {
    const search =
      intent?.current?.path === location.pathname
        ? intent.current.search
        : window.location.pathname === location.pathname
          ? window.location.search
          : location.search;
    const next = contentHref(location.pathname, search, key, value);
    if (intent)
      intent.current = {
        path: location.pathname,
        search: next.includes("?") ? next.slice(next.indexOf("?")) : "",
      };
    void navigate(next, { preventScrollReset: true });
  };
}
export function ContentFilterLink({
  field,
  value,
  children,
  ...props
}: {
  field: string;
  value: string;
  children: ReactNode;
  className?: string;
  "aria-current"?: "page";
}) {
  const location = useFilterLocation(),
    change = useChangeContentFilter();
  return (
    <Link
      {...props}
      to={contentHref(location.pathname, location.search, field, value)}
      preventScrollReset
      onClick={(event) => {
        if (
          event.button === 0 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey
        ) {
          event.preventDefault();
          change(field, value);
        }
      }}
    >
      {children}
    </Link>
  );
}

export function useFilterLocation() {
  const location = useLocation(),
    navigation = useNavigation();
  const pending = navigation.location;
  // Fast successive selections must build on the navigation already in flight.
  return pending?.pathname === location.pathname
    ? { ...location, search: pending.search }
    : location;
}

export function useContentSource() {
  const location = useLocation();
  const current = validOrigin({
    path: location.pathname + location.search,
    key: location.key,
    index:
      typeof window === "undefined" ? undefined : window.history.state?.idx,
  });
  return {
    returnTo: current ??
      validOrigin(location.state?.returnTo) ?? { path: "/", label: "Square" },
  };
}

export function useContentReturn(fallback = "/") {
  const location = useLocation(),
    navigate = useNavigate();
  const origin =
    validOrigin(location.state?.returnTo) ?? validOrigin({ path: fallback })!;
  function go() {
    const current = window.history.state?.idx;
    // Pop the original entry so React Router restores its scroll and cached pages.
    if (
      typeof current === "number" &&
      origin.index !== undefined &&
      origin.index < current &&
      origin.key
    )
      void navigate(origin.index - current);
    else void navigate(origin.path);
  }
  return { origin, go };
}

export function ContentBack({ fallback = "/" }: { fallback?: string }) {
  const { origin, go } = useContentReturn(fallback);
  return (
    <Link
      className="text-link content-back"
      to={origin.path}
      onClick={(event) => {
        if (
          event.button === 0 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey
        ) {
          event.preventDefault();
          go();
        }
      }}
    >
      ← Back to {origin.label}
    </Link>
  );
}

export function ContentKinds() {
  const location = useFilterLocation(),
    kind = contentKind(new URLSearchParams(location.search));
  return (
    <nav className="kind-filters" aria-label="Content categories">
      {contentKinds.map(([key, label]) => (
        <ContentFilterLink
          key={key}
          className={"chip " + (kind === key ? "chosen" : "")}
          aria-current={kind === key ? "page" : undefined}
          field="kind"
          value={key}
        >
          {label}
        </ContentFilterLink>
      ))}
    </nav>
  );
}

export function CreationFormats() {
  const location = useFilterLocation(),
    type = new URLSearchParams(location.search).get("type") ?? "all";
  return (
    <nav
      className="kind-filters creation-formats"
      aria-label="Creation formats"
    >
      {(["all", ...workTypes] as const).map((format) => (
        <ContentFilterLink
          key={format}
          className={"chip " + (type === format ? "chosen" : "")}
          aria-current={type === format ? "page" : undefined}
          field="type"
          value={format}
        >
          {format === "all" ? "All formats" : typeLabels[format]}
        </ContentFilterLink>
      ))}
    </nav>
  );
}

export function ShareOptions({ kind }: { kind: "work" | "update" | "help" }) {
  const state = useContentSource();
  const location = useLocation(),
    tag = new URLSearchParams(location.search).get("tag");
  return (
    <nav className="share-options" aria-label="What to share">
      {(
        [
          ["update", MessageCircle, "Updates", "What’s happening?"],
          ["work", Sparkles, "Creations", "Show what you made"],
          ["help", Handshake, "Help requests", "Ask for a hand"],
        ] as const
      ).map(([key, Icon, label, description]) => (
        <Link
          key={key}
          to={shareHref(key, tag)}
          state={state}
          replace
          className={kind === key ? "selected" : ""}
          aria-current={kind === key ? "page" : undefined}
        >
          <Icon size={21} />
          <strong>{label}</strong>
          <span>{description}</span>
        </Link>
      ))}
    </nav>
  );
}
