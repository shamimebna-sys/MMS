import { hasGrant, type AccessUser } from "@/lib/auth/permissions";
import { pool } from "@/lib/db";
import type { NavGroup } from "@/components/shell/app-shell";
import { resolveResource } from "@/server/resources";

type MenuRow = {
  id: number;
  title: string;
  url: string;
  route: string | null;
  parent_id: number | null;
  order: number;
};

const PANEL_ROLES: Record<string, string[]> = {
  "Agent Panel": ["Agent"],
  "Sub Agent Panel": ["Sub Agent"],
  "Agency Panel": ["Agency", "Agencier"],
};

const SKIPPED_SLUGS = new Set(["database", "compass", "bread"]);

function hrefFor(item: MenuRow, tables: Map<string, string>): string | null {
  if (item.title === "Dashboard") return "/dashboard";
  const route = item.route ?? "";
  const match = /^voyager\.(.+)\.index$/.exec(route);
  if (match) {
    const slug = match[1];
    if (SKIPPED_SLUGS.has(slug)) return null;
    if (slug === "media" || slug === "settings" || tables.has(slug) || resolveResource(slug)) return `/records/${slug}`;
    return null;
  }
  if (route === "admin.my.candidate.create") return "/records/candidates/new";
  if (route === "admin.my.payment-request.index") return "/records/payment-requests";
  if (route === "admin.my.profile.index") return "/profile";
  if (route === "admin.my.wallet.index") return "/wallet";
  return null;
}

const DEDICATED_ROLES = new Set(["Agent", "Sub Agent", "Agency", "Agencier"]);

function ownPanel(title: string, user: AccessUser): boolean {
  const roles = PANEL_ROLES[title];
  return Boolean(roles && user.roleName && roles.includes(user.roleName));
}

function hiddenGroup(title: string, user: AccessUser): boolean {
  if (PANEL_ROLES[title]) return !ownPanel(title, user);
  if (user.roleName && DEDICATED_ROLES.has(user.roleName)) return title !== "Notifications" && title !== "Reports";
  return false;
}

function allowed(item: MenuRow, href: string, user: AccessUser, tables: Map<string, string>): boolean {
  if (href === "/dashboard" || href === "/profile" || href === "/wallet" || href.endsWith("/new")) return true;
  const slug = href.replace("/records/", "");
  const table = tables.get(slug) ?? slug.replace(/-/g, "_");
  return hasGrant(user, `browse_${table}`);
}

export async function loadMenu(user: AccessUser): Promise<NavGroup[]> {
  const [itemsResult, typesResult] = await Promise.all([
    pool.query(
      `SELECT id, title, url, route, parent_id, "order"
       FROM menu_items
       WHERE menu_id = (SELECT id FROM menus WHERE name = 'admin')
       ORDER BY "order", id`,
    ),
    pool.query(`SELECT slug, name FROM data_types`),
  ]);
  const items = itemsResult.rows as MenuRow[];
  const tables = new Map<string, string>(typesResult.rows.map((row: { slug: string; name: string }) => [row.slug, row.name]));
  const children = new Map<number | null, MenuRow[]>();
  for (const item of items) {
    const key = item.parent_id;
    const list = children.get(key) ?? [];
    list.push(item);
    children.set(key, list);
  }

  const groups: NavGroup[] = [];
  for (const item of children.get(null) ?? []) {
    if (hiddenGroup(item.title, user)) continue;
    const panel = ownPanel(item.title, user);
    const ownHref = hrefFor(item, tables);
    if (ownHref && (panel || allowed(item, ownHref, user, tables))) {
      groups.push({ title: item.title, items: [{ href: ownHref, label: item.title }] });
      continue;
    }
    const nested = (children.get(item.id) ?? [])
      .map((child) => {
        const href = hrefFor(child, tables);
        if (!href || (!panel && !allowed(child, href, user, tables))) return null;
        return { href, label: child.title };
      })
      .filter((child): child is { href: string; label: string } => child != null);
    if (nested.length) groups.push({ title: item.title, items: nested });
  }
  return groups.filter((group) => group.title !== "Dashboard");
}
