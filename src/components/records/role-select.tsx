"use client";

import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export type RoleOption = { value: string; label: string };

export function filterRoleOptions(options: RoleOption[], query: string): RoleOption[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return options;
  return options.filter((option) => option.label.toLowerCase().includes(needle));
}

export function nextRoleOptionIndex(current: number, delta: number, count: number): number {
  if (count <= 0) return -1;
  if (current < 0 || current >= count) return delta < 0 ? count - 1 : 0;
  return (current + delta + count) % count;
}

type PanelBox = { left: number; width: number; maxHeight: number; top?: number; bottom?: number };

const PANEL_MAX = 320;
const VIEWPORT_GAP = 8;

function panelBox(trigger: HTMLElement): PanelBox {
  const rect = trigger.getBoundingClientRect();
  const width = Math.min(rect.width, window.innerWidth - VIEWPORT_GAP * 2);
  const left = Math.min(Math.max(VIEWPORT_GAP, rect.left), window.innerWidth - width - VIEWPORT_GAP);
  const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - VIEWPORT_GAP);
  const spaceAbove = Math.max(0, rect.top - 64);
  const openUp = spaceBelow < 260 && spaceAbove > spaceBelow;
  const maxHeight = Math.min(PANEL_MAX, Math.max(0, openUp ? spaceAbove : spaceBelow));
  if (openUp) return { left, width, maxHeight, bottom: Math.max(VIEWPORT_GAP, window.innerHeight - rect.top + 6) };
  return { left, width, maxHeight, top: rect.bottom + 6 };
}

export function RoleSelect({
  id,
  name,
  options,
  defaultValue,
  required = false,
  emptyLabel,
  searchPlaceholder = "Search roles",
  listLabel = "Roles",
  emptyMessage = "No matching roles",
  tone = "accent",
  triggerClassName,
}: {
  id: string;
  name: string;
  options: RoleOption[];
  defaultValue: string;
  required?: boolean;
  emptyLabel: string;
  searchPlaceholder?: string;
  listLabel?: string;
  emptyMessage?: string;
  tone?: "accent" | "brand";
  triggerClassName?: string;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [box, setBox] = useState<PanelBox | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);

  const choices = useMemo<RoleOption[]>(() => [{ value: "", label: emptyLabel }, ...options], [emptyLabel, options]);
  const visible = filterRoleOptions(choices, query);
  const safeIndex = visible.length === 0 ? -1 : Math.min(Math.max(activeIndex, 0), visible.length - 1);
  const activeId = safeIndex >= 0 ? `${listId}-option-${safeIndex}` : undefined;
  const selectedLabel = value ? (options.find((option) => option.value === value)?.label ?? value) : emptyLabel;
  const focusRing =
    tone === "brand"
      ? "border-[#dc2626] shadow-[0_0_0_3px_rgb(220_38_38_/_0.16)]"
      : "border-accent shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_13%,transparent)]";
  const selectedTone =
    tone === "brand"
      ? "bg-red-50 font-medium text-red-700"
      : "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] font-medium text-accent";

  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    if (!trigger) return;
    function place() {
      if (trigger) setBox(panelBox(trigger));
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open || !activeId) return;
    document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
  }, [open, activeId]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
      setQuery("");
    }
    function onFocusIn(event: FocusEvent) {
      const target = event.target as Node | null;
      if (target && (rootRef.current?.contains(target) || panelRef.current?.contains(target))) return;
      setOpen(false);
      setQuery("");
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [open]);

  function openMenu(start: "selected" | "first" | "last") {
    const dialog = triggerRef.current?.closest("[role='dialog']");
    setHost(dialog instanceof HTMLElement ? dialog : document.body);
    setQuery("");
    const selected = choices.findIndex((option) => option.value === value);
    const index = start === "last" ? choices.length - 1 : start === "first" ? 0 : selected >= 0 ? selected : 0;
    setActiveIndex(index);
    setOpen(true);
  }

  function closeMenu(focusTrigger = false) {
    setOpen(false);
    setQuery("");
    if (focusTrigger) triggerRef.current?.focus();
  }

  function choose(option: RoleOption) {
    setValue(option.value);
    closeMenu(true);
  }

  function onQuery(next: string) {
    setQuery(next);
    setActiveIndex(0);
  }

  function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => nextRoleOptionIndex(current, event.key === "ArrowDown" ? 1 : -1, visible.length));
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setActiveIndex(Math.max(visible.length - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const option = visible[safeIndex];
      if (option) choose(option);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
    }
  }

  const panel =
    open && box && host
      ? createPortal(
          <div
            ref={panelRef}
            data-role-select-panel=""
            style={{ top: box.top, bottom: box.bottom, left: box.left, width: box.width, maxHeight: box.maxHeight }}
            className={cn(
              "fixed flex flex-col overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-[var(--shadow-lg)]",
              host === document.body ? "z-30" : "z-[140]",
            )}
          >
            <div className="shrink-0 border-b border-border p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden="true" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(event) => onQuery(event.target.value)}
                  onKeyDown={onSearchKeyDown}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  aria-controls={listId}
                  aria-activedescendant={activeId}
                  aria-autocomplete="list"
                  autoComplete="off"
                  spellCheck={false}
                  className={cn(
                    "h-9 w-full rounded-lg border border-border bg-background pr-8 pl-8 text-sm text-foreground outline-none placeholder:text-muted focus:bg-card",
                    tone === "brand"
                      ? "focus:border-[#dc2626] focus:shadow-[0_0_0_3px_rgb(220_38_38_/_0.16)]"
                      : "focus:border-accent focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_13%,transparent)]",
                  )}
                />
                {query ? (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => {
                      onQuery("");
                      searchRef.current?.focus();
                    }}
                    className="absolute top-1/2 right-1.5 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-muted transition-colors hover:bg-background hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            </div>
            <ul
              id={listId}
              role="listbox"
              aria-label={listLabel}
              className="min-h-0 flex-1 scroll-smooth overflow-y-auto overscroll-contain px-1.5 py-1.5 [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]"
            >
              {visible.length === 0 ? (
                <li className="px-2.5 py-6 text-center text-[13px] text-muted">{emptyMessage}</li>
              ) : (
                visible.map((option, index) => {
                  const selected = option.value === value;
                  const active = index === safeIndex;
                  return (
                    <li key={`${option.value}-${option.label}`} role="presentation">
                      <button
                        type="button"
                        id={`${listId}-option-${index}`}
                        role="option"
                        aria-selected={selected}
                        tabIndex={-1}
                        onMouseEnter={() => setActiveIndex(index)}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => choose(option)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13.5px] leading-5 text-foreground transition-colors",
                          active && "bg-background",
                          selected && selectedTone,
                          selected && active && tone === "accent" && "bg-[color-mix(in_srgb,var(--accent)_18%,transparent)]",
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">{option.label}</span>
                        {selected ? <Check className={cn("h-3.5 w-3.5 shrink-0", tone === "brand" ? "text-red-600" : "text-accent")} aria-hidden="true" /> : <span className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>,
          host,
        )
      : null;

  return (
    <div ref={rootRef} className="relative" data-role-select="" data-value={value}>
      <select
        name={name}
        value={value}
        required={required}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={(event) => setValue(event.target.value)}
      >
        <option value="">{emptyLabel}</option>
        {options.map((option) => (
          <option key={`${name}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? activeId : undefined}
        aria-required={required || undefined}
        onClick={() => (open ? closeMenu() : openMenu("selected"))}
        onKeyDown={(event) => {
          if (open) return;
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openMenu("selected");
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            openMenu("last");
          }
        }}
        className={cn("control flex items-center justify-between gap-2 text-left", triggerClassName, open && focusRing)}
      >
        <span className="min-w-0 flex-1 truncate">{selectedLabel}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-transform duration-150", open && "rotate-180")} aria-hidden="true" />
      </button>
      {panel}
    </div>
  );
}
