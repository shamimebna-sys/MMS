"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function UploadForm({ ownerTable, ownerId }: { ownerTable: string; ownerId: string }) {
  const [message, setMessage] = useState("");

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const response = await fetch("/api/uploads", { method: "POST", body: new FormData(event.currentTarget) });
        setMessage(response.ok ? "File stored." : await response.text());
      }}
    >
      <input type="hidden" name="ownerTable" value={ownerTable} />
      <input type="hidden" name="ownerId" value={ownerId} />
      <input name="file" type="file" required accept="application/pdf,image/jpeg,image/png,image/webp" className="text-sm" />
      <Button type="submit" size="sm">
        Upload
      </Button>
      {message ? <span className="text-sm text-muted">{message}</span> : null}
    </form>
  );
}
