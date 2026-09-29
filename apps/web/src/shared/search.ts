export function normalizeSearch(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/gu, " ");
}

export function matchExcerpt(text: string, query: string) {
  const clean = text.replace(/\s+/gu, " ").trim();
  const first = query.split(" ")[0]?.toLowerCase() ?? "";
  const position = clean.toLowerCase().indexOf(first);
  const start = Math.max(0, position - 60);
  const excerpt = Array.from(clean.slice(start)).slice(0, 240).join("");
  return (
    (start ? "…" : "") +
    excerpt +
    (start + excerpt.length < clean.length ? "…" : "")
  );
}
