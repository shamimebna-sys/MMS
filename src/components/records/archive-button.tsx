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
        <Dialog.Overlay className="erp-overlay" />
        <Dialog.Content className="erp-modal">
          <div className="erp-modal-header">
            <div>
              <Dialog.Title className="erp-modal-title">Archive this record?</Dialog.Title>
              <Dialog.Description className="erp-modal-copy">
                The row stays in the database with an archive timestamp and will no longer appear in active lists.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close" className="erp-modal-close">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>
          <div className="erp-modal-footer">
            <Dialog.Close asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </Dialog.Close>
            <form action={archiveRecordAction}>
              <input type="hidden" name="resource" value={resource} />
              <input type="hidden" name="id" value={id} />
              <Button type="submit" className="record-save h-[2.375rem] rounded-lg border-0 bg-[var(--rc-red)] text-white hover:bg-[var(--rc-red-hover)] hover:opacity-100">
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
