import { Fragment, type ReactNode } from "react";
import { type ArticleNode, safeUrl } from "../shared/contracts";
import { MediaImage } from "./media-image";
export function Article({
  document,
  privateImages = false,
}: {
  document: ArticleNode;
  privateImages?: boolean;
}) {
  function render(node: ArticleNode, index: number): ReactNode {
    let content: ReactNode = node.content?.map(render);
    if (node.type === "text") {
      content = node.text;
      for (const mark of node.marks ?? []) {
        if (mark.type === "bold") content = <strong>{content}</strong>;
        if (mark.type === "italic") content = <em>{content}</em>;
        if (mark.type === "strike") content = <s>{content}</s>;
        if (mark.type === "code") content = <code>{content}</code>;
        if (
          mark.type === "link" &&
          typeof mark.attrs?.href === "string" &&
          safeUrl(mark.attrs.href)
        )
          content = (
            <a
              href={mark.attrs.href}
              rel="noopener noreferrer nofollow ugc"
              target="_blank"
            >
              {content}
            </a>
          );
      }
      return <Fragment key={index}>{content}</Fragment>;
    }
    switch (node.type) {
      case "doc":
        return <Fragment key={index}>{content}</Fragment>;
      case "paragraph":
        return <p key={index}>{content}</p>;
      case "heading":
        return node.attrs?.level === 3 ? (
          <h3 key={index}>{content}</h3>
        ) : (
          <h2 key={index}>{content}</h2>
        );
      case "hardBreak":
        return <br key={index} />;
      case "bulletList":
        return <ul key={index}>{content}</ul>;
      case "orderedList":
        return (
          <ol key={index} start={Number(node.attrs?.start ?? 1)}>
            {content}
          </ol>
        );
      case "listItem":
        return <li key={index}>{content}</li>;
      case "blockquote":
        return <blockquote key={index}>{content}</blockquote>;
      case "codeBlock":
        return (
          <pre key={index}>
            <code>{content}</code>
          </pre>
        );
      case "horizontalRule":
        return <hr key={index} />;
      case "image":
        return (
          <MediaImage
            key={index}
            id={String(node.attrs?.mediaId ?? "")}
            alt={String(node.attrs?.alt ?? "")}
            privateImage={privateImages}
          />
        );
      default:
        return null;
    }
  }
  return <div className="prose">{render(document, 0)}</div>;
}
