import { useState } from "react";
import { Link } from "react-router";
import { useTopics } from "./catalog";

export function TopicPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const topics = useTopics(),
    [search, setSearch] = useState("");
  return (
    <fieldset className="topic-picker" disabled={disabled}>
      <legend className="field mb-3">
        Tags{" "}
        <span className="field-note">
          Choose up to 5. Anyone can share under the same tag.
        </span>
      </legend>
      {topics.length > 8 && (
        <input
          className="mb-3"
          aria-label="Find tags"
          placeholder="Find tags"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}
      <div className="tag-catalog">
        {topics
          .filter(
            (t) =>
              value.includes(t.id) ||
              t.name.toLowerCase().includes(search.trim().toLowerCase()),
          )
          .map((t) => (
            <button
              type="button"
              key={t.id}
              aria-pressed={value.includes(t.id)}
              className={"chip " + (value.includes(t.id) ? "chosen" : "")}
              disabled={!value.includes(t.id) && value.length >= 5}
              onClick={() =>
                onChange(
                  value.includes(t.id)
                    ? value.filter((id) => id !== t.id)
                    : [...value, t.id],
                )
              }
            >
              {t.name}
            </button>
          ))}
      </div>
    </fieldset>
  );
}

export function TopicLinks({ ids }: { ids: string[] }) {
  const topics = useTopics();
  return ids.length ? (
    <div className="content-tags">
      {ids.map((id) => (
        <Link
          className="chip"
          key={id}
          to={"/?" + new URLSearchParams({ tag: id })}
        >
          {topics.find((t) => t.id === id)?.name ?? id}
        </Link>
      ))}
    </div>
  ) : null;
}
