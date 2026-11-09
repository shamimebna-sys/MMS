"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, type ReactNode } from "react";

export function FormModal({
  title,
  description,
  closeHref,
  wide = true,
  panelClassName,
  children,
}: {
  title: string;
  description: string;
  closeHref: string;
  wide?: boolean;
  panelClassName?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const closing = useRef(false);

  function close() {
    if (closing.current) return;
    closing.current = true;
    router.replace(closeHref, { scroll: false });
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="form-modal-overlay" />
        <Dialog.Content
          className="form-modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div className={[wide ? "form-modal" : "form-modal form-modal-compact", panelClassName].filter(Boolean).join(" ")}>
            <header className="form-modal-header">
              <div className="min-w-0">
                <Dialog.Title className="form-modal-title">{title}</Dialog.Title>
                <Dialog.Description className="form-modal-copy">{description}</Dialog.Description>
              </div>
              <Dialog.Close type="button" className="form-modal-close" aria-label="Close">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </header>
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
