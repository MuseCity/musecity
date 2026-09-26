import { TopicLinks } from "./topic-picker";
import { Link } from "react-router";
import { ArrowUpRight, Bot } from "lucide-react";
import { type WorkContent, type WorkView } from "../shared/contracts";
import { Article } from "./article";
import { MediaImage } from "./media-image";
import { dateLabel } from "./work-list";
export function WorkBody({
  body,
  privateImages = false,
}: {
  body: WorkContent;
  privateImages?: boolean;
}) {
  return (
    <>
      {body.type !== "image" && body.coverMediaId && (
        <MediaImage
          id={body.coverMediaId}
          alt={body.title}
          privateImage={privateImages}
          className="detail-cover"
        />
      )}
      {body.type === "image" && (
        <div className="space-y-4 mt-7">
          {body.imageMediaIds?.map((id) => (
            <MediaImage
              key={id}
              id={id}
              alt={body.title}
              privateImage={privateImages}
              className="detail-cover"
            />
          ))}
        </div>
      )}
      {body.articleDocument ? (
        <div className="detail-body">
          <Article
            document={body.articleDocument}
            privateImages={privateImages}
          />
        </div>
      ) : (
        body.description && (
          <p className="detail-body whitespace-pre-wrap">{body.description}</p>
        )
      )}
      {(body.websiteUrl || body.videoUrl) && (
        <a
          className="primary mt-6"
          href={body.websiteUrl ?? body.videoUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
        >
          {body.type === "website" ? "Visit website" : "Watch video"}
          <ArrowUpRight size={16} />
        </a>
      )}
      <TopicLinks ids={body.tagIds} />
      {(body.aiDeclaration !== undefined || body.aiTools.length > 0) && (
        <p className="text-xs text-muted mt-7">
          {body.aiDeclaration === true
            ? "AI-assisted · creator declaration"
            : body.aiDeclaration === false
              ? "Created without AI · creator declaration"
              : "Tools"}
          {body.aiTools.length ? " · " + body.aiTools.join(", ") : ""}
        </p>
      )}
    </>
  );
}
export function WorkDetail({
  work,
  preview = false,
}: {
  work: WorkView;
  preview?: boolean;
}) {
  return (
    <>
      <div className="eyebrow">
        {preview ? "DRAFT PREVIEW" : work.body.type.toUpperCase()}
      </div>
      <h1>{work.body.title}</h1>
      <div className="flex flex-wrap gap-2 items-center mt-4 text-xs text-muted">
        <Link className="creator" to={"/u/" + work.owner.handle}>
          {work.owner.name}
        </Link>
        <span>·</span>
        <time dateTime={work.publishedAt ?? undefined}>
          {dateLabel(work.publishedAt)}
        </time>
        {work.submittedBy && (
          <>
            <span>·</span>
            <Bot size={13} />
            <span>
              {work.submittedBy.name} · {work.owner.name}’s Agent
            </span>
          </>
        )}
      </div>
      {!preview && work.submittedBy && (
        <p className="text-xs text-muted mt-2">
          {work.publishedBy
            ? `Published by agent ${work.publishedBy.name}`
            : `Reviewed and published by ${work.owner.name}`}
        </p>
      )}
      <WorkBody body={work.body} privateImages={preview} />
    </>
  );
}
