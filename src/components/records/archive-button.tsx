"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Archive, X } from "lucide-react";
import { archiveRecordAction } from "@/app/(workspace)/records/actions";
import { Button } from "@/components/ui/button";

export function ArchiveButton({ resource, id }: { resource: string; id: string }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button type="button" variant="outline">
          <Archive className="h-3.5 w-3.5" />
          Archive
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[min(26rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-6 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          style={{ boxShadow: "0 4px 8px rgb(15 22 35 / 0.06), 0 20px 56px rgb(15 22 35 / 0.10)" }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-[15px] font-semibold text-foreground">
                Archive this record?
              </Dialog.Title>
              <Dialog.Description className="mt-1.5 text-[13px] leading-relaxed text-muted">
                The row stays in the database with an archive timestamp and will no longer appear in
                active lists.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-background hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </Dialog.Close>
            <form action={archiveRecordAction}>
              <input type="hidden" name="resource" value={resource} />
              <input type="hidden" name="id" value={id} />
              <Button type="submit">
                <Archive className="h-3.5 w-3.5" />
                Archive
              </Button>
            </form>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
