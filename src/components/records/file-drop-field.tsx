"use client";

import { FileText, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { isImagePath, mediaUrl, storedFiles } from "@/lib/media";

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

export function FileDropField({ id, name, value }: { id: string; name: string; value: string }) {
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState("");

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setFileName(file?.name ?? "");
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      if (!file || !file.type.startsWith("image/")) return "";
      return URL.createObjectURL(file);
    });
  }

  const stored = storedFiles(value)[0];
  const storedPreview = !preview && stored && isImagePath(stored.path) ? mediaUrl(stored.path) : "";
  const shown = preview || storedPreview;
  const caption = fileName || stored?.name || "No file selected";
  const document = !shown && (fileName.toLowerCase().endsWith(".pdf") || (stored ? !isImagePath(stored.path) : false));

  return (
    <div className="flex h-[4.75rem] items-center gap-3 rounded-lg border border-dashed border-[var(--rc-line)] bg-[var(--rc-soft)] px-3">
      {shown ? (
        <img src={shown} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
      ) : (
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-md border border-[var(--rc-line)] bg-[var(--rc-card)] text-[var(--rc-muted)]">
          {document ? <FileText className="h-5 w-5" aria-hidden="true" /> : <Upload className="h-5 w-5" aria-hidden="true" />}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-[var(--rc-heading)]">{caption}</p>
        <label
          htmlFor={id}
          className="mt-1.5 inline-flex h-7 cursor-pointer items-center rounded-md border border-[var(--rc-line)] bg-[var(--rc-card)] px-2.5 text-[12px] font-medium text-[var(--rc-heading)]"
        >
          Choose file
        </label>
      </div>
      <input id={id} name={name} type="file" accept={ACCEPT} onChange={onChange} className="sr-only" />
    </div>
  );
}
