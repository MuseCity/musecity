import {
  useEditor,
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import type { ArticleNode } from "../shared/contracts";
import { safeUrl } from "../shared/contracts";
import { MediaImage } from "./media-image";
import { UploadImage } from "./upload";
import { useState } from "react";
import { Dialog, Notice } from "./ui";
const InlineImage = ({ node }: NodeViewProps) => (
  <NodeViewWrapper>
    <MediaImage
      id={String(node.attrs.mediaId)}
      privateImage
      alt={String(node.attrs.alt ?? "")}
    />
  </NodeViewWrapper>
);
const MediaNode = Image.extend({
  addAttributes() {
    return { mediaId: { default: null }, alt: { default: "" } };
  },
  parseHTML() {
    return [
      {
        tag: "img[data-media-id]",
        getAttrs: (el) => ({
          mediaId: (el as HTMLElement).getAttribute("data-media-id"),
          alt: (el as HTMLElement).getAttribute("alt") ?? "",
        }),
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      "img",
      {
        "data-media-id": HTMLAttributes.mediaId,
        alt: HTMLAttributes.alt,
        src: "/media/" + HTMLAttributes.mediaId,
      },
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(InlineImage);
  },
});
function canonical(node: ArticleNode): ArticleNode {
  const result: ArticleNode = { type: node.type };
  if (node.text !== undefined) result.text = node.text;
  if (node.content) result.content = node.content.map(canonical);
  if (node.attrs) {
    if (node.type === "image")
      result.attrs = { mediaId: node.attrs.mediaId, alt: node.attrs.alt ?? "" };
    if (node.type === "heading") result.attrs = { level: node.attrs.level };
    if (node.type === "orderedList")
      result.attrs = { start: node.attrs.start ?? 1 };
    if (node.type === "codeBlock" && node.attrs.language)
      result.attrs = { language: node.attrs.language };
  }
  if (node.marks?.length)
    result.marks = node.marks.map((m) =>
      m.type === "link"
        ? { type: "link", attrs: { href: m.attrs?.href } }
        : { type: m.type },
    );
  return result;
}
export function ArticleEditor({
  value,
  onChange,
}: {
  value: ArticleNode;
  onChange: (value: ArticleNode) => void;
}) {
  const [insert, setInsert] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState("");
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        underline: false,
        link: {
          openOnClick: false,
          protocols: ["https"],
          isAllowedUri: (url) => safeUrl(url),
        },
      }),
      MediaNode,
    ],
    content: value,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor }) =>
      onChange(canonical(editor.getJSON() as ArticleNode)),
  });
  if (!editor) return <div className="editor-box state">Loading editor…</div>;
  const actions: [string, () => void, boolean][] = [
    [
      "B",
      () => editor.chain().focus().toggleBold().run(),
      editor.isActive("bold"),
    ],
    [
      "I",
      () => editor.chain().focus().toggleItalic().run(),
      editor.isActive("italic"),
    ],
    [
      "S",
      () => editor.chain().focus().toggleStrike().run(),
      editor.isActive("strike"),
    ],
    [
      "H2",
      () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      editor.isActive("heading", { level: 2 }),
    ],
    [
      "H3",
      () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      editor.isActive("heading", { level: 3 }),
    ],
    [
      "• List",
      () => editor.chain().focus().toggleBulletList().run(),
      editor.isActive("bulletList"),
    ],
    [
      "1. List",
      () => editor.chain().focus().toggleOrderedList().run(),
      editor.isActive("orderedList"),
    ],
    [
      "Quote",
      () => editor.chain().focus().toggleBlockquote().run(),
      editor.isActive("blockquote"),
    ],
    [
      "Code",
      () => editor.chain().focus().toggleCodeBlock().run(),
      editor.isActive("codeBlock"),
    ],
  ];
  return (
    <>
      <div className="editor-box">
        <div className="editor-toolbar" aria-label="Article formatting">
          {actions.map(([label, run, active]) => (
            <button
              key={label}
              type="button"
              className={active ? "active" : ""}
              aria-label={
                label === "B"
                  ? "Bold"
                  : label === "I"
                    ? "Italic"
                    : label === "S"
                      ? "Strikethrough"
                      : label
              }
              aria-pressed={active}
              onClick={run}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setLink(editor.getAttributes("link").href ?? "");
              setError("");
            }}
          >
            Link
          </button>
          <button type="button" onClick={() => setInsert(true)}>
            Image
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
          >
            Undo
          </button>
        </div>
        <EditorContent editor={editor} className="prose" />
      </div>
      {insert && (
        <Dialog title="Add an image" onClose={() => setInsert(false)}>
          <UploadImage
            onUpload={(ids) => {
              editor
                .chain()
                .focus()
                .insertContent({
                  type: "image",
                  attrs: { mediaId: ids[0], alt: "" },
                })
                .run();
              setInsert(false);
            }}
          />
        </Dialog>
      )}
      {link !== null && (
        <Dialog title="Add a link" onClose={() => setLink(null)}>
          <label className="field">
            Public HTTPS URL
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://example.com"
            />
          </label>
          {error && <Notice>{error}</Notice>}
          <div className="flex justify-end gap-2 mt-5">
            <button
              className="secondary"
              onClick={() => {
                editor.chain().focus().unsetLink().run();
                setLink(null);
              }}
            >
              Remove link
            </button>
            <button
              className="primary"
              onClick={() => {
                if (!safeUrl(link)) {
                  setError("Use a public HTTPS URL.");
                  return;
                }
                editor
                  .chain()
                  .focus()
                  .extendMarkRange("link")
                  .setLink({ href: link })
                  .run();
                setLink(null);
              }}
            >
              Apply link
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
