"use client";

import { useState } from "react";
import { listingAvatarSrc } from "@/components/records/user-listing-avatar";

export function UserListingAvatar({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  const href = listingAvatarSrc(src, failed);
  return (
    <span className="flex flex-wrap items-center gap-2">
      <a href={href} target="_blank" rel="noreferrer" className="inline-grid gap-1 text-xs text-muted">
        <img
          src={href}
          alt={failed ? "default.png" : "Avatar"}
          className="h-10 w-10 rounded-md object-cover"
          onError={() => setFailed(true)}
        />
        {failed ? <span>default.png</span> : null}
      </a>
    </span>
  );
}
