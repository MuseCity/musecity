import { Form } from "react-router";
import {
  ContentFilterLink,
  useChangeContentFilter,
  useFilterLocation,
} from "./content-navigation";

export function ContentSearch({
  label = "Search content",
  placeholder = "Search creations and posts…",
}: {
  label?: string;
  placeholder?: string;
}) {
  const location = useFilterLocation(),
    change = useChangeContentFilter(),
    params = new URLSearchParams(location.search);
  const query = params.get("q") ?? "";
  return (
    <Form
      className="content-search"
      role="search"
      method="get"
      action={location.pathname}
      onSubmit={(event) => {
        event.preventDefault();
        const value = new FormData(event.currentTarget).get("q");
        change("q", typeof value === "string" ? value.trim() : "");
      }}
    >
      {Array.from(params.entries())
        .filter(([key]) => key !== "q" && key !== "cursor")
        .map(([key, value], index) => (
          <input key={key + index} type="hidden" name={key} value={value} />
        ))}
      <label className="field">
        <span className="sr-only">{label}</span>
        <input
          key={query}
          type="search"
          name="q"
          maxLength={120}
          defaultValue={query}
          placeholder={placeholder}
        />
      </label>
      <button className="primary" type="submit">
        Search
      </button>
      {query && (
        <ContentFilterLink className="text-link" field="q" value="">
          Clear search
        </ContentFilterLink>
      )}
    </Form>
  );
}
