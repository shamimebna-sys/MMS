"use client";

import {
  Activity,
  Award,
  BadgeCheck,
  Banknote,
  Bell,
  BookOpen,
  BookText,
  Bookmark,
  Box,
  Briefcase,
  Building,
  Building2,
  Bus,
  Calendar,
  Camera,
  CarFront,
  ChartColumn,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronRight,
  CircleCheckBig,
  CircleUser,
  ClipboardCheck,
  ClipboardList,
  Cog,
  Compass,
  Contact,
  ContactRound,
  Database,
  Factory,
  FileClock,
  FileSpreadsheet,
  FileType,
  Files,
  Flag,
  FolderCog,
  FolderHeart,
  FolderKey,
  Fuel,
  Gauge,
  Globe,
  GraduationCap,
  Hammer,
  HandCoins,
  Handshake,
  Headset,
  History,
  Hourglass,
  House,
  IdCard,
  Images,
  Inbox,
  Kanban,
  KeyRound,
  Landmark,
  Layers,
  LayoutDashboard,
  Link2,
  ListTree,
  Lock,
  Mail,
  Map,
  MapPin,
  Megaphone,
  Menu,
  MessageSquare,
  Moon,
  Navigation,
  Network,
  Newspaper,
  Package,
  Palette,
  Phone,
  Plane,
  Power,
  Receipt,
  Scale,
  School,
  Settings,
  Share2,
  Shield,
  Ship,
  ShoppingBag,
  ShoppingCart,
  SquareUser,
  Star,
  Store,
  Sun,
  Tags,
  Ticket,
  Truck,
  UserCog,
  UserPen,
  UserPlus,
  UserRound,
  UserRoundPlus,
  UserSearch,
  Users,
  Video,
  Wallet,
  WalletCards,
  Warehouse,
  Waypoints,
  Wrench,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { logoutAction } from "@/app/login/actions";
import { Portrait } from "@/components/media/portrait";

export type NavGroup = { title: string; items: Array<{ href: string; label: string }> };

// ── Icon maps ──────────────────────────────────────────────────────────────

/** Icon shown on the collapsible section heading. Kept distinct from item icons. */
const GROUP_ICON: Record<string, LucideIcon> = {
  Operations: Cog,
  Sales: ShoppingCart,
  Accounts: BookOpen,
  Administrative: FolderCog,
  "Site Monitor": Activity,
  Management: Kanban,
  "Agent Panel": Headset,
  "Sub Agent Panel": Waypoints,
  "Agency Panel": Store,
  Tools: Wrench,
  Notifications: Bell,
  Reports: ChartColumn,
  "Candidate file": FolderHeart,
  Administration: FolderKey,
};

/**
 * One distinct outline icon per menu entry.
 * Keys are the menu label. When the same label exists under more than one
 * section, the key is "Section / Label" so those entries do not share an icon.
 */
const ITEM_ICON: Record<string, LucideIcon> = {
  Dashboard: LayoutDashboard,
  // Operations / automotive
  Vehicles: CarFront,
  Shipments: Truck,
  "Showrooms & Inventory": Warehouse,
  Suppliers: Building2,
  // Sales
  "Sales Orders": ShoppingBag,
  Customers: UserRound,
  // Accounts
  "AP Aging": Hourglass,
  "AR Aging": History,
  "Bank Accounts": Landmark,
  "Cash Book": BookText,
  "Cash Reconciliation": ClipboardCheck,
  "Trial Balance": Scale,
  "Profit & Loss": ChartNoAxesCombined,
  // Tools
  "Menu Builder": ListTree,
  // Administrative
  Roles: Shield,
  Users: Users,
  Media: Images,
  Settings: Settings,
  // Site Monitor
  Categories: Tags,
  Pages: Files,
  Posts: Newspaper,
  // Management
  Employees: IdCard,
  Employers: Factory,
  Agents: Handshake,
  Companies: Building,
  Agencys: Network,
  "Payment Approval": BadgeCheck,
  Teachers: GraduationCap,
  "Document Types": FileType,
  Candidates: Contact,
  "Class Groups": School,
  Announcements: Megaphone,
  Exams: ClipboardList,
  "Payment Requests": Receipt,
  "Banner Candidates": Star,
  Positions: Briefcase,
  Licenses: Award,
  "Ticket Companies": Plane,
  "Ticket Invoices": Ticket,
  "Sub Agents": UserCog,
  // Agent Panel
  "Agent Panel / My Profile": CircleUser,
  "Agent Panel / My Wallet": Wallet,
  "Agent Panel / Add Candidate": UserPlus,
  "Agent Panel / My Candidates": ContactRound,
  "Agent Panel / Payment Request": HandCoins,
  "Agent Panel / My Sub Agent": Share2,
  "Agent Panel / Sub Agent Payment Approval": CircleCheckBig,
  "Agent Panel / Sub Agent Payment Requests": FileClock,
  // Sub Agent Panel
  "Sub Agent Panel / My Profile": UserPen,
  "Sub Agent Panel / Add Candidate": UserRoundPlus,
  "Sub Agent Panel / My Candidates": SquareUser,
  "Sub Agent Panel / My Wallet": WalletCards,
  "Sub Agent Panel / Payment Request": Banknote,
  // Agency Panel
  Invoices: FileSpreadsheet,
  "Agency Panel / My Candidates": UserSearch,
  // Standalone
  Reports: ChartColumn,
  Notifications: Bell,
};

const FALLBACK_ICONS: LucideIcon[] = [
  Calendar,
  MapPin,
  Globe,
  Link2,
  KeyRound,
  Lock,
  Database,
  Compass,
  Layers,
  Box,
  Package,
  Ship,
  Bus,
  Fuel,
  Gauge,
  Hammer,
  Palette,
  Camera,
  Video,
  Mail,
  Inbox,
  Phone,
  MessageSquare,
  Bookmark,
  Flag,
  Map,
  Navigation,
].filter((icon) => !new Set<LucideIcon>([...Object.values(ITEM_ICON), ...Object.values(GROUP_ICON)]).has(icon));

function iconKey(label: string, group?: string): string {
  return group && group !== label ? `${group} / ${label}` : label;
}

function fallbackIcon(label: string): LucideIcon {
  let hash = 0;
  for (let i = 0; i < label.length; i += 1) hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  return FALLBACK_ICONS[hash % FALLBACK_ICONS.length] ?? Bookmark;
}

function getItemIcon(label: string, group?: string): LucideIcon {
  return ITEM_ICON[iconKey(label, group)] ?? ITEM_ICON[label] ?? fallbackIcon(`${group ?? ""}/${label}`);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function matchesPath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function itemActive(pathname: string, href: string, hrefs: string[]): boolean {
  if (!matchesPath(pathname, href)) return false;
  return !hrefs.some((other) => other.length > href.length && matchesPath(pathname, other));
}

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "U"
  );
}

// ── Design tokens ──────────────────────────────────────────────────────────
const SIDEBAR_BG = "#111827";
const SIDEBAR_FG = "#f1f5f9";
const ACTIVE_BG = "#263247";
const ACTIVE_RED = "#ef4444";
const NAV_MUTED = "rgba(255,255,255,0.46)";
const NAV_ACTIVE = "#ffffff";
const ITEM_H = 44;
const CHILD_H = 42;
const SECTION_H = 44;

const MENU_ICON_SIZE = 19;

const SECTION_SUMMARY =
  "flex cursor-pointer select-none items-center gap-3 rounded-[7px] px-3 text-[13px] font-bold uppercase leading-5 tracking-[1.2px] transition-colors duration-150";

// ── Sub-components ─────────────────────────────────────────────────────────

interface NavItemProps {
  href: string;
  label: string;
  icon: LucideIcon;
  isActive: boolean;
  expanded: boolean; // sidebar open?
  onClick?: () => void;
  size?: "primary" | "child";
}

function NavItem({ href, label, icon: Icon, isActive, expanded, onClick, size = "primary" }: NavItemProps) {
  const minHeight = size === "child" ? CHILD_H : ITEM_H;
  const labelClass =
    size === "child"
      ? "text-[15px] font-medium leading-5"
      : "text-[15px] font-semibold leading-5";

  return (
    <Link
      href={href}
      onClick={onClick}
      aria-label={label}
      className={[
        "group relative flex items-center rounded-[7px] transition-colors duration-150",
        expanded ? "gap-3 px-3" : "justify-center",
        isActive ? "text-white" : "text-white/45 hover:bg-white/[0.05] hover:text-white",
      ].join(" ")}
      style={{
        minHeight,
        height: size === "child" ? "auto" : minHeight,
        background: isActive ? ACTIVE_BG : undefined,
        paddingTop: size === "child" ? 8 : undefined,
        paddingBottom: size === "child" ? 8 : undefined,
      }}
    >
      {isActive && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full"
          style={{ width: 3, height: size === "child" ? 22 : 24, background: ACTIVE_RED }}
        />
      )}
      <Icon size={MENU_ICON_SIZE} strokeWidth={1.8} className="shrink-0 text-current" />
      {expanded ? (
        <span className={`min-w-0 flex-1 whitespace-normal break-words ${labelClass}`}>{label}</span>
      ) : (
        <span className="pointer-events-none absolute left-[calc(100%+8px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md bg-[#263247] px-2.5 py-1.5 text-[13px] font-medium leading-none text-white opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100">
          {label}
        </span>
      )}
    </Link>
  );
}

function SectionToggle({
  title,
  icon: Icon,
  open,
  parentActive,
  onClick,
}: {
  title: string;
  icon: LucideIcon;
  open: boolean;
  parentActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={[
        SECTION_SUMMARY,
        "w-full border-0 bg-transparent text-left font-[inherit]",
        open ? "bg-white/[0.05]" : "",
        parentActive ? "text-white/90" : "text-white/45 hover:bg-white/[0.04] hover:text-white/70",
      ].join(" ")}
      style={{ minHeight: SECTION_H }}
      aria-expanded={open}
      onClick={onClick}
    >
      <Icon size={MENU_ICON_SIZE} strokeWidth={1.8} className="shrink-0 text-current" />
      <span className="min-w-0 flex-1 whitespace-normal break-words leading-5">{title}</span>
      <ChevronDown
        size={13}
        strokeWidth={2}
        className={`nav-chevron shrink-0 opacity-60 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      />
    </button>
  );
}

const ACCOUNT_LABEL = "Super Admin";

type MenuPlace = { left: number; top: number; width: number };

function placeAccountMenu(anchor: HTMLElement, menuHeight = 248, align: "start" | "end" = "start"): MenuPlace {
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(300, Math.max(220, window.innerWidth - 16));
  let left = align === "end" ? rect.right - width : rect.left;
  if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
  if (left < 8) left = 8;
  const spaceAbove = rect.top - 8;
  const spaceBelow = window.innerHeight - rect.bottom - 8;
  const top =
    spaceBelow >= menuHeight || spaceBelow >= spaceAbove
      ? Math.min(rect.bottom + 8, Math.max(8, window.innerHeight - menuHeight - 8))
      : Math.max(8, rect.top - menuHeight - 8);
  return { left, top, width };
}

function AccountMenu({
  userName,
  userEmail,
  userAvatar,
  compact = false,
  tone = "sidebar",
  onNavigate,
}: {
  userName: string;
  userEmail: string;
  userAvatar: string;
  compact?: boolean;
  tone?: "sidebar" | "header";
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<MenuPlace | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const anchor = buttonRef.current;
    if (anchor) setPlace(placeAccountMenu(anchor, 248, tone === "header" ? "end" : "start"));
    setOpen(true);
  }

  function closeAndGo() {
    setOpen(false);
    onNavigate?.();
  }

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const anchor = buttonRef.current;
      if (!anchor) return;
      setPlace(placeAccountMenu(anchor, panelRef.current?.offsetHeight, tone === "header" ? "end" : "start"));
    };
    const frame = requestAnimationFrame(update);
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointer(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, tone]);

  const menu =
    open && place
      ? createPortal(
          <div
            ref={panelRef}
            role="menu"
            aria-label="Account"
            className="fixed z-[80] max-h-[calc(100vh-16px)] overflow-y-auto rounded-lg border border-[#e6e8ee] bg-white p-3 text-[#111827] shadow-[0_8px_24px_rgb(15_22_35/0.12),0_2px_6px_rgb(15_22_35/0.06)]"
            style={{ left: place.left, top: place.top, width: place.width }}
          >
            <div className="flex items-center gap-3 px-1.5 py-1">
              <span className="grid h-11 w-11 shrink-0 overflow-hidden rounded-full">
                <Portrait path={userAvatar} name={userName || "User"} className="h-11 w-11 text-[13px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[16px] font-semibold leading-5">{userName || "User"}</p>
                {userEmail ? (
                  <p className="mt-0.5 truncate text-[12px] font-normal leading-4 text-[#6b7280]">{userEmail}</p>
                ) : null}
              </div>
            </div>
            <div className="my-2.5 h-px bg-[#e8eaef]" />
            <Link
              href="/profile"
              role="menuitem"
              onClick={closeAndGo}
              className="flex items-center gap-3 rounded-md px-2.5 py-2.5 text-[15px] font-medium leading-5 text-[#111827] transition-colors hover:bg-[#f4f6f8]"
            >
              <UserRound size={18} strokeWidth={1.8} className="shrink-0 text-[#4b5563]" />
              Profile
            </Link>
            <Link
              href="/dashboard"
              role="menuitem"
              onClick={closeAndGo}
              className="flex items-center gap-3 rounded-md px-2.5 py-2.5 text-[15px] font-medium leading-5 text-[#111827] transition-colors hover:bg-[#f4f6f8]"
            >
              <House size={18} strokeWidth={1.8} className="shrink-0 text-[#4b5563]" />
              Home
            </Link>
            <form action={logoutAction} className="mt-2">
              <button
                type="submit"
                role="menuitem"
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#ef4444] px-3 py-2.5 text-[15px] font-semibold leading-5 text-white transition-colors hover:bg-[#dc2626]"
              >
                <Power size={18} strokeWidth={1.8} />
                Logout
              </button>
            </form>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ACCOUNT_LABEL}
        className={
          tone === "header"
            ? "inline-flex h-9 max-w-full items-center gap-2 rounded-lg border border-border/80 bg-card py-1 pl-1 pr-3 text-left text-foreground transition-colors hover:bg-background"
            : compact
              ? "grid h-8 w-8 place-items-center rounded-lg text-[11px] font-semibold"
              : "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/[0.06]"
        }
        style={compact && tone !== "header" ? { background: "rgba(255,255,255,0.10)" } : undefined}
      >
        {tone === "header" ? (
          <>
            <span className="grid h-7 w-7 shrink-0 overflow-hidden rounded-full">
              <Portrait path={userAvatar} name={userName || "User"} className="h-7 w-7 text-[10px]" />
            </span>
            <span className="truncate text-[14px] font-semibold leading-none">{ACCOUNT_LABEL}</span>
          </>
        ) : compact ? (
          initials(userName)
        ) : (
          <>
            <span className="grid h-8 w-8 shrink-0 overflow-hidden rounded-lg">
              <Portrait path={userAvatar} name={userName || "User"} className="h-8 w-8 text-[11px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold leading-tight">{ACCOUNT_LABEL}</span>
              <span className="mt-0.5 block text-[10.5px] leading-tight" style={{ color: "rgba(255,255,255,0.40)" }}>
                Signed in
              </span>
            </span>
          </>
        )}
      </button>
      {menu}
    </>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function AppShell({
  groups,
  userName,
  userEmail,
  userAvatar,
  unread,
  children,
}: {
  groups: NavGroup[];
  userName: string;
  userEmail: string;
  userAvatar: string;
  unread: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const { resolvedTheme, setTheme } = useTheme();
  const pathname = usePathname();
  const [navPath, setNavPath] = useState(pathname);
  if (pathname !== navPath) {
    setNavPath(pathname);
    setMobileOpen(false);
  }

  function toggleSection(title: string) {
    setOpenSection((current) => (current === title ? null : title));
  }

  const hrefs = groups.flatMap((g) => g.items.map((i) => i.href));
  const current =
    groups.flatMap((g) => g.items).find((i) => itemActive(pathname, i.href, hrefs))?.label ??
    (pathname.startsWith("/dashboard") ? "Dashboard" : "Hopline ERP");

  // ── Desktop sidebar nav tree ──────────────────────────

  function renderDesktopNav() {
    return (
      <nav
        className="flex-1 overflow-y-auto"
        style={{ padding: "8px 12px 16px" }}
        role="navigation"
        aria-label="Main navigation"
      >
        {/* Dashboard – standalone primary item */}
        <NavItem
          href="/dashboard"
          label="Dashboard"
          icon={LayoutDashboard}
          isActive={pathname.startsWith("/dashboard")}
          expanded={open}
        />

        {/* Dynamic groups */}
        {groups.map((group) => {
          const sectionIcon = GROUP_ICON[group.title] ?? Layers;
          const single = group.items.length === 1 && group.items[0]?.label === group.title;
          const Icon =
            !open && single && group.items[0]
              ? getItemIcon(group.items[0].label, group.title)
              : sectionIcon;
          const groupActive = group.items.some((item) => itemActive(pathname, item.href, hrefs));

          /* ── Collapsed sidebar: only icon, links to first item ── */
          if (!open) {
            const href = group.items[0]?.href;
            if (!href) return null;
            const pageActive = Boolean(single && groupActive);
            return (
              <Link
                key={group.title}
                href={href}
                aria-label={single && group.items[0] ? group.items[0].label : group.title}
                className="group relative mt-0.5 flex justify-center items-center rounded-[7px] transition-colors duration-150 hover:bg-white/[0.05]"
                style={{
                  height: ITEM_H,
                  background: pageActive ? ACTIVE_BG : groupActive ? "rgba(255,255,255,0.05)" : undefined,
                  color: pageActive || groupActive ? NAV_ACTIVE : NAV_MUTED,
                }}
              >
                {pageActive && (
                  <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full"
                    style={{ width: 3, height: 24, background: ACTIVE_RED }}
                  />
                )}
                <Icon size={MENU_ICON_SIZE} strokeWidth={1.8} className="shrink-0 text-current" />
                <span className="pointer-events-none absolute left-[calc(100%+8px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md bg-[#263247] px-2.5 py-1.5 text-[13px] font-medium leading-none text-white opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100">
                  {single && group.items[0] ? group.items[0].label : group.title}
                </span>
              </Link>
            );
          }

          /* ── Single-item group (no section wrapper) ── */
          if (single && group.items[0]) {
            const item = group.items[0];
            const isActive = itemActive(pathname, item.href, hrefs);
            return (
              <div key={group.title} className="mt-0.5">
                <NavItem
                  href={item.href}
                  label={item.label}
                  icon={getItemIcon(item.label, group.title)}
                  isActive={isActive}
                  expanded={open}
                />
              </div>
            );
          }

          /* ── Multi-item collapsible section ── */
          const sectionOpen = openSection === group.title;
          return (
            <div key={group.title} className="nav-group mt-1">
              <SectionToggle
                title={group.title}
                icon={Icon}
                open={sectionOpen}
                parentActive={groupActive}
                onClick={() => toggleSection(group.title)}
              />

              {sectionOpen ? (
                <div className="mt-0.5 mb-1 space-y-px" style={{ paddingLeft: 20 }}>
                  {group.items.map((item) => {
                    const isActive = itemActive(pathname, item.href, hrefs);
                    return (
                      <NavItem
                        key={item.href}
                        href={item.href}
                        label={item.label}
                        icon={getItemIcon(item.label, group.title)}
                        isActive={isActive}
                        expanded={open}
                        size="child"
                      />
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen bg-background text-foreground">

      {/* ═══════════════════════════════════════════════════════
          Desktop sidebar
          ═══════════════════════════════════════════════════════ */}
      <aside
        className={[
          "sticky top-0 hidden h-screen shrink-0 flex-col",
          "border-r border-white/[0.07]",
          "supports-[height:100dvh]:h-dvh md:flex",
          "transition-[width] duration-200 ease-in-out",
          open ? "w-[255px]" : "w-[68px]",
        ].join(" ")}
        style={{ background: SIDEBAR_BG, color: SIDEBAR_FG }}
      >
        {/* ── Brand header ── */}
        <div
          className={[
            "flex shrink-0 items-center border-b border-white/[0.07]",
            open ? "gap-3 px-3 py-4" : "justify-center py-4",
          ].join(" ")}
          style={{ minHeight: 72 }}
        >
          <Link
            href="/dashboard"
            className="grid shrink-0 place-items-center rounded-xl text-[14px] font-bold text-white shadow-md"
            style={{
              width: 36,
              height: 36,
              background: "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)",
              letterSpacing: "-0.01em",
            }}
            title="Hopline ERP"
          >
            H
          </Link>
          {open && (
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-bold leading-tight" style={{ color: SIDEBAR_FG }}>
                Hopline ERP
              </p>
              <p className="text-[12px] font-normal leading-snug" style={{ color: "rgba(255,255,255,0.5)" }}>
                Automotive Marketplace &amp; ERP Solution
              </p>
            </div>
          )}
        </div>

        {/* ── Navigation ── */}
        {renderDesktopNav()}

        {/* ── User footer ── */}
        {open ? (
          <div className="shrink-0 border-t border-white/[0.07] px-3 py-3">
            <AccountMenu userName={userName} userEmail={userEmail} userAvatar={userAvatar} />
          </div>
        ) : (
          <div className="flex shrink-0 justify-center border-t border-white/[0.07] py-3">
            <AccountMenu userName={userName} userEmail={userEmail} userAvatar={userAvatar} compact />
          </div>
        )}
      </aside>

      {/* ═══════════════════════════════════════════════════════
          Main content area
          ═══════════════════════════════════════════════════════ */}
      <div className="flex min-w-0 flex-1 flex-col">

        {/* ── Top header ── */}
        <header
          className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border/70 bg-card/95 px-4 py-[11px] backdrop-blur-md md:px-6"
          style={{ paddingTop: "max(11px, env(safe-area-inset-top))" }}
        >
          {/* Left: toggle + breadcrumb */}
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                if (window.matchMedia("(max-width: 767px)").matches) setMobileOpen((v) => !v);
                else setOpen((v) => !v);
              }}
              aria-label="Toggle navigation"
              aria-expanded={mobileOpen}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border/80 bg-card text-foreground/60 transition-colors hover:bg-background hover:text-foreground"
            >
              <Menu className="h-[15px] w-[15px]" />
            </button>

            <div className="flex min-w-0 items-center gap-1.5 text-sm">
              <span className="hidden shrink-0 text-[12px] text-muted sm:inline">Workspace</span>
              <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-muted sm:block" />
              <span className="truncate text-[13px] font-semibold text-foreground">{current}</span>
            </div>
          </div>

          {/* Right: notifications, theme, account */}
          <div className="flex shrink-0 items-center gap-1.5">
            <Link
              href="/records/notifications"
              className="relative grid h-9 w-9 place-items-center rounded-lg border border-border/80 bg-card text-foreground/60 transition-colors hover:bg-background hover:text-foreground"
              aria-label="Notifications"
            >
              <Bell className="h-[15px] w-[15px]" />
              {unread > 0 && (
                <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-accent px-1 text-center text-[9px] font-bold leading-[18px] text-accent-foreground">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>

            <button
              type="button"
              aria-label="Toggle color theme"
              className="grid h-9 w-9 place-items-center rounded-lg border border-border/80 bg-card text-foreground/60 transition-colors hover:bg-background hover:text-foreground"
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            >
              <Sun className="h-[15px] w-[15px] dark:hidden" />
              <Moon className="hidden h-[15px] w-[15px] dark:block" />
            </button>

            <AccountMenu userName={userName} userEmail={userEmail} userAvatar={userAvatar} tone="header" />
          </div>
        </header>

        {/* ═══════════════════════════════════════════════════════
            Mobile nav drawer
            ═══════════════════════════════════════════════════════ */}
        {mobileOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            {/* Backdrop */}
            <button
              type="button"
              aria-label="Close navigation"
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />

            {/* Drawer panel */}
            <nav
              className="relative flex h-full flex-col overflow-y-auto shadow-2xl"
              style={{
                width: "min(100%, 20rem)",
                background: SIDEBAR_BG,
                color: SIDEBAR_FG,
                paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
              }}
              role="navigation"
              aria-label="Mobile navigation"
            >
              {/* Mobile brand row */}
              <div
                className="flex shrink-0 items-center justify-between border-b border-white/[0.07] px-4 pb-4 pt-4"
                style={{ minHeight: 72 }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="grid h-9 w-9 place-items-center rounded-xl text-[14px] font-bold text-white"
                    style={{ background: "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)" }}
                  >
                    H
                  </span>
                  <div>
                    <p className="text-[16px] font-bold leading-tight">Hopline ERP</p>
                    <p className="text-[12px] font-normal leading-snug" style={{ color: "rgba(255,255,255,0.5)" }}>
                      Automotive Marketplace &amp; ERP Solution
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close menu"
                  className="grid h-8 w-8 place-items-center rounded-lg transition-colors hover:bg-white/[0.08]"
                  style={{ color: "rgba(255,255,255,0.60)" }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Mobile nav items */}
              <div style={{ padding: "8px 12px 16px" }}>
                {/* Dashboard */}
                <NavItem
                  href="/dashboard"
                  label="Dashboard"
                  icon={LayoutDashboard}
                  isActive={pathname.startsWith("/dashboard")}
                  expanded
                  onClick={() => setMobileOpen(false)}
                />

                {/* Groups */}
                {groups.map((group) => {
                  const Icon = GROUP_ICON[group.title] ?? Layers;
                  const single = group.items.length === 1 && group.items[0]?.label === group.title;
                  const groupActive = group.items.some((item) => itemActive(pathname, item.href, hrefs));

                  if (single && group.items[0]) {
                    const item = group.items[0];
                    const isActive = itemActive(pathname, item.href, hrefs);
                    return (
                      <div key={group.title} className="mt-0.5">
                        <NavItem
                          href={item.href}
                          label={item.label}
                          icon={getItemIcon(item.label, group.title)}
                          isActive={isActive}
                          expanded
                          onClick={() => setMobileOpen(false)}
                        />
                      </div>
                    );
                  }

                  const sectionOpen = openSection === group.title;
                  return (
                    <div key={group.title} className="nav-group mt-1">
                      <SectionToggle
                        title={group.title}
                        icon={Icon}
                        open={sectionOpen}
                        parentActive={groupActive}
                        onClick={() => toggleSection(group.title)}
                      />

                      {sectionOpen ? (
                        <div className="mt-0.5 mb-1 space-y-px" style={{ paddingLeft: 20 }}>
                          {group.items.map((item) => {
                            const isActive = itemActive(pathname, item.href, hrefs);
                            return (
                              <NavItem
                                key={item.href}
                                href={item.href}
                                label={item.label}
                                icon={getItemIcon(item.label, group.title)}
                                isActive={isActive}
                                expanded
                                onClick={() => setMobileOpen(false)}
                                size="child"
                              />
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {/* Mobile user footer */}
              <div className="mt-auto border-t border-white/[0.07] px-4 py-3">
                <AccountMenu
                  userName={userName}
                  userEmail={userEmail}
                  userAvatar={userAvatar}
                  onNavigate={() => setMobileOpen(false)}
                />
              </div>
            </nav>
          </div>
        )}

        {/* ── Page content ── */}
        <main className="flex-1 px-4 py-6 md:px-6 md:py-8">{children}</main>
      </div>
    </div>
  );
}
