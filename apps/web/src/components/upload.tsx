import { useState, useEffect } from "react";
import { Upload } from "lucide-react";
import { useApi, errorMessage, request } from "./api";
import { Notice } from "./ui";
import { prepareImage } from "./prepare-image";
import type { ImagePurpose } from "../shared/images";
export function UploadImage({
  onUpload,
  label = "Upload image",
  multiple = false,
  onBusyChange,
  purpose = "content",
}: {
  onUpload: (ids: string[]) => void;
  label?: string;
  multiple?: boolean;
  onBusyChange?: (busy: boolean) => void;
  purpose?: ImagePurpose;
}) {
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  async function upload(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    setError("");
    try {
      const ids: string[] = [];
      for (const source of files) {
        const file = await prepareImage(source, purpose);
        const data = await api<{
          mediaId: string;
          uploadUrl: string;
          uploadToken: string;
        }>("/media/uploads", {
          mimeType: file.type,
          byteSize: file.size,
          purpose,
        });
        await request(data.uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": file.type,
            "X-Upload-Token": data.uploadToken,
          },
          body: file,
        });
        await api("/media/" + data.mediaId + "/complete", {});
        ids.push(data.mediaId);
      }
      onUpload(ids);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <label
        className={
          "upload-area cursor-pointer " +
          (busy ? "opacity-50 pointer-events-none" : "")
        }
      >
        <Upload size={20} />
        <span>{busy ? "Preparing and uploading…" : label}</span>
        <span className="text-xs">JPEG, PNG or WebP · up to 20 MiB</span>
        <input
          type="file"
          className="sr-only"
          aria-label={label}
          accept="image/jpeg,image/png,image/webp"
          multiple={multiple}
          disabled={busy}
          onChange={(e) => {
            void upload(
              Array.from(e.target.files ?? []).slice(0, multiple ? 9 : 1),
            );
            e.target.value = "";
          }}
        />
      </label>
      {error && <Notice>{error} Try uploading again.</Notice>}
    </div>
  );
}
