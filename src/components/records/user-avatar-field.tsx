"use client";

import { Camera } from "lucide-react";
import { useEffect, useState } from "react";
import { Portrait } from "@/components/media/portrait";

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

export function UserAvatarField({
  id,
  name,
  value,
  personName,
}: {
  id: string;
  name: string;
  value: string;
  personName: string;
}) {
  const [objectUrl, setObjectUrl] = useState("");
  const [fileName, setFileName] = useState("");

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setFileName(file?.name ?? "");
    setObjectUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      if (!file || !file.type.startsWith("image/")) return "";
      return URL.createObjectURL(file);
    });
  }

  const stored = value.trim();
  const caption = fileName || (stored ? "Current photo" : "No file chosen");

  return (
    <div className="flex flex-row items-center gap-4 rounded-xl border border-dashed border-border bg-background px-4 py-4 lg:flex-col lg:px-4 lg:py-5 lg:text-center">
      {objectUrl ? (
        <img src={objectUrl} alt="Selected profile photo preview" className="h-20 w-20 shrink-0 rounded-2xl object-cover ring-1 ring-border" />
      ) : (
        <Portrait path={stored} name={personName || "User"} className="h-20 w-20 shrink-0 rounded-2xl text-base ring-1 ring-border" />
      )}
      <div className="min-w-0 flex-1 lg:flex-none">
        <p className="truncate text-[13px] font-medium">{caption}</p>
        <p className="mt-1 text-[12px] leading-4 text-muted">JPEG, PNG, WebP, or PDF. Leave this empty to keep the current photo.</p>
        <label htmlFor={id} className="btn-quiet mt-3 cursor-pointer px-3">
          <Camera className="h-3.5 w-3.5" aria-hidden="true" />
          Upload photo
        </label>
      </div>
      <input id={id} name={name} type="file" accept={ACCEPT} onChange={onChange} className="sr-only" />
    </div>
  );
}
