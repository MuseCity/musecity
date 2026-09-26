import { useContentSource } from "./content-navigation";
import { Link } from "react-router";
import { Bot, ArrowUpRight } from "lucide-react";
import { type WorkView, articleText } from "../shared/contracts";
import { MediaImage } from "./media-image";
export const dateLabel = (date: string | null) =>
  date
    ? new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(new Date(date))
    : "Draft";
export function WorkList({ items }: { items: WorkView[] }) {
  const state = useContentSource();
  return (
    <div className="work-list">
      {items.map((work) => {
        const cover =
          work.body.type === "image"
            ? work.body.imageMediaIds?.[0]
            : work.body.coverMediaId;
        const excerpt =
          work.body.description ||
          (work.body.articleDocument
            ? articleText(work.body.articleDocument)
            : "");
        const to = "/works/" + work.workId;
        return (
          <article className="work-row" key={work.workId}>
            {cover && (
              <Link
                state={state}
                to={to}
                tabIndex={-1}
                aria-hidden="true"
                className="thumb-link"
              >
                <MediaImage variant="feed" id={cover} className="thumbnail" />
              </Link>
            )}
            <div className="work-copy">
              <div className="work-title">
                <Link state={state} to={to}>
                  {work.body.title}
                </Link>
                {["website", "video"].includes(work.body.type) && (
                  <ArrowUpRight size={14} className="text-muted shrink-0" />
                )}
              </div>
              <p className="excerpt">{excerpt}</p>
              <div className="work-meta">
                <Link to={"/u/" + work.owner.handle} className="creator">
                  {work.owner.name}
                </Link>
                <span className="dot">·</span>
                <span>{dateLabel(work.publishedAt)}</span>
                <span className="dot">·</span>
                <span className={"kind kind-" + work.body.type}>
                  {work.body.type}
                </span>
                {work.submittedBy && (
                  <>
                    <span className="dot">·</span>
                    <span className="agent-credit">
                      <Bot size={12} />
                      {work.submittedBy.name} · {work.owner.name}’s Agent
                    </span>
                  </>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
