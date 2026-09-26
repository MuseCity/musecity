export const contentKinds = [
  ["all", "All"],
  ["work", "Creations"],
  ["update", "Updates"],
  ["help", "Help requests"],
] as const;

export function contentKind(params: URLSearchParams) {
  // Old format/topic URLs remain valid and visibly belong to Creations.
  return params.get("type") || params.get("tag")
    ? "work"
    : params.get("kind") || "all";
}

function currentListParams(search: string) {
  const params = new URLSearchParams(search);
  if (params.has("ecosystem")) {
    params.delete("ecosystem");
    params.delete("cursor");
  }
  return params;
}

export function retiredEcosystemPath(url: URL): string | null {
  if (!url.searchParams.has("ecosystem")) return null;
  const params = currentListParams(url.search);
  return url.pathname + (params.size ? "?" + params : "") + url.hash;
}

export function contentHref(
  path: string,
  search: string,
  key: string,
  value: string,
) {
  const next = currentListParams(search);
  next.delete("cursor");
  if (key === "kind") {
    if (value !== "work")
      for (const incompatible of ["type", "tag", "status"])
        next.delete(incompatible);
    if (value !== "help") next.delete("help");
  }
  if (key === "type" || key === "tag") {
    next.set("kind", "work");
    next.delete(key === "type" ? "tag" : "type");
    next.delete("help");
  }
  if (value && value !== "all") next.set(key, value);
  else next.delete(key);
  return path + (next.size ? "?" + next : "");
}

export function publicContentParams(search: string, owner?: string) {
  const params = currentListParams(search);
  params.delete("status");
  params.delete("edit");
  if (params.get("type") || params.get("tag")) params.set("kind", "work");
  if (owner) {
    params.set("owner", owner);
    params.delete("view");
  }
  return params;
}

export type ContentOrigin = {
  path: string;
  label: string;
  index?: number;
  key?: string;
};
export function validOrigin(value: unknown): ContentOrigin | null {
  if (!value || typeof value !== "object") return null;
  const origin = value as ContentOrigin;
  if (
    typeof origin.path !== "string" ||
    !/^(\/(?:\?|$)|\/me\/content(?:\?|$)|\/u\/[\w-]+(?:\?|$)|\/notifications(?:\?|$))/.test(
      origin.path,
    )
  )
    return null;
  const cleaned = retiredEcosystemPath(
    new URL(origin.path, "http://localhost"),
  );
  return {
    path: cleaned ?? origin.path,
    label: origin.path.startsWith("/me/")
      ? "My content"
      : origin.path.startsWith("/u/")
        ? "Profile"
        : origin.path.startsWith("/notifications")
          ? "Notifications"
          : "Square",
    index:
      !cleaned && Number.isInteger(origin.index) ? origin.index : undefined,
    key: !cleaned && typeof origin.key === "string" ? origin.key : undefined,
  };
}
