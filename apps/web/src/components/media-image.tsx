import { useEffect, useRef, useState } from "react";
import { useAuth } from "./auth";
import type { ImageWidth } from "../shared/images";

const variants = {
  avatar: { widths: [128, 256], sizes: "72px", fallback: 128 },
  feed: {
    widths: [256, 512, 768, 1536],
    sizes: "(max-width: 680px) calc(100vw - 48px), 640px",
    fallback: 768,
  },
  detail: {
    widths: [512, 768, 1536, 2560],
    sizes: "(max-width: 800px) calc(100vw - 48px), 960px",
    fallback: 1536,
  },
} satisfies Record<
  string,
  { widths: ImageWidth[]; sizes: string; fallback: ImageWidth }
>;

type Props = {
  id: string;
  alt?: string;
  privateImage?: boolean;
  className?: string;
  variant?: keyof typeof variants;
};

export function MediaImage(props: Props) {
  const auth = useAuth();
  // Remount on identity/media changes so a previous private blob cannot flash.
  return (
    <ImageContent
      key={`${props.id}:${props.privateImage}:${props.variant}:${auth.userId}`}
      {...props}
    />
  );
}

function ImageContent({
  id,
  alt = "",
  privateImage = false,
  className = "",
  variant = "detail",
}: Props) {
  const auth = useAuth();
  const placeholder = useRef<HTMLSpanElement>(null);
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  const spec = variants[variant];
  useEffect(() => {
    if (!privateImage) return;
    let active = true,
      objectUrl = "",
      started = false;
    const abort = new AbortController();
    const element = placeholder.current;
    async function load() {
      if (started) return;
      started = true;
      try {
        const token = await auth.token();
        if (!active) return;
        if (!token) throw new Error("Image unavailable");
        const pixels =
          (element?.getBoundingClientRect().width || spec.fallback) *
          Math.min(window.devicePixelRatio || 1, 2);
        const width =
          spec.widths.find((w) => w >= pixels) ?? spec.widths.at(-1)!;
        const response = await fetch(`/media/${id}?w=${width}`, {
          headers: { Authorization: "Bearer " + token },
          signal: abort.signal,
        });
        if (!response.ok) throw new Error("Image unavailable");
        const blob = await response.blob();
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch {
        if (active) setFailed(true);
      }
    }
    const observer =
      typeof IntersectionObserver === "undefined"
        ? undefined
        : new IntersectionObserver(
            (entries) => {
              if (entries.some((entry) => entry.isIntersecting)) {
                observer?.disconnect();
                void load();
              }
            },
            { rootMargin: "300px" },
          );
    if (observer && element) observer.observe(element);
    else void load();
    return () => {
      active = false;
      observer?.disconnect();
      abort.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, privateImage, variant, auth.userId]);
  const src = privateImage ? url : `/media/${id}?w=${spec.fallback}`;
  if (failed || !src)
    return (
      <span
        ref={placeholder}
        className={"image-placeholder " + className}
        style={
          variant === "avatar"
            ? { minWidth: 1, minHeight: 1 }
            : { display: "block", width: "100%", aspectRatio: "4 / 3" }
        }
        aria-label={failed ? "Image unavailable" : "Loading image"}
      />
    );
  return (
    <img
      src={src}
      srcSet={
        privateImage
          ? undefined
          : spec.widths
              .map((width) => `/media/${id}?w=${width} ${width}w`)
              .join(", ")
      }
      sizes={privateImage ? undefined : spec.sizes}
      className={className}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
