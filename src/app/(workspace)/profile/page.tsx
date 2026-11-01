import { requireUser } from "@/server/current-user";
import { pool } from "@/lib/db";
import { formatMoney, statusLabel } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUser();
  const result = await pool.query(
    `SELECT u.name, u.email, u.status, r.display_name AS role_name,
            a.code AS agent_code, a.name AS agent_name, a.mobile AS agent_mobile, a.balance::text AS agent_balance,
            s.code AS sub_code, s.name AS sub_name, s.balance::text AS sub_balance
     FROM users u
     LEFT JOIN roles r ON r.id = u.role_id
     LEFT JOIN agents a ON a.id = u.agent_id
     LEFT JOIN sub_agents s ON s.id = u.sub_agent_id
     WHERE u.id = $1`,
    [user.id],
  );
  const row = result.rows[0] as Record<string, string | null> | undefined;
  const fields = [
    ["Name", row?.name],
    ["Email", row?.email],
    ["Role", row?.role_name],
    ["Status", statusLabel(row?.status)],
    ["Agent", [row?.agent_code, row?.agent_name].filter(Boolean).join(" ")],
    ["Agent mobile", row?.agent_mobile],
    ["Agent balance", row?.agent_balance ? formatMoney(row.agent_balance) : ""],
    ["Sub agent", [row?.sub_code, row?.sub_name].filter(Boolean).join(" ")],
    ["Sub agent balance", row?.sub_balance ? formatMoney(row.sub_balance) : ""],
  ].filter((field) => field[1]);

  return (
    <section className="space-y-5">
      {/* Page header */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Account</p>
        <h1 className="page-title mt-1">My Profile</h1>
      </div>

      {/* Profile fields */}
      <dl className="surface grid gap-px overflow-hidden sm:grid-cols-2">
        {fields.map(([label, value]) => (
          <div key={label} className="bg-card px-5 py-4">
            <dt className="text-[10.5px] font-semibold uppercase tracking-[0.13em] text-muted">{label}</dt>
            <dd className="mt-1.5 text-[13.5px]">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
