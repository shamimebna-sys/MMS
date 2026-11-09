import { requireUser } from "@/server/current-user";
import { pool } from "@/lib/db";
import { formatMoney } from "@/lib/utils";
import { toPublicProfile, type ProfileSource } from "@/server/profile";
import { ProfileWorkspace } from "@/components/profile/profile-workspace";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUser();
  const result = await pool.query(
    `SELECT u.name, u.email, u.status, u.avatar, u.email_verified_at,
            r.display_name AS role_name,
            CASE
              WHEN u.employee_id IS NOT NULL THEN NULLIF(btrim(e.mobile), '')
              WHEN u.sub_agent_id IS NOT NULL THEN NULLIF(btrim(s.mobile), '')
              WHEN u.candidate_id IS NOT NULL THEN NULLIF(btrim(c.mobile), '')
              ELSE NULL
            END AS phone,
            (
              SELECT NULLIF(btrim(ex.designation), '')
              FROM experiences ex
              WHERE ex.user_id = u.id
                AND ex.designation IS NOT NULL
                AND btrim(ex.designation) <> ''
              ORDER BY ex.start_date DESC NULLS LAST, ex.id DESC
              LIMIT 1
            ) AS designation,
            a.code AS agent_code, a.name AS agent_name, a.mobile AS agent_mobile, a.balance::text AS agent_balance,
            s.code AS sub_code, s.name AS sub_name, s.balance::text AS sub_balance
     FROM users u
     LEFT JOIN roles r ON r.id = u.role_id
     LEFT JOIN employees e ON e.id = u.employee_id
     LEFT JOIN agents a ON a.id = u.agent_id
     LEFT JOIN sub_agents s ON s.id = u.sub_agent_id
     LEFT JOIN candidates c ON c.id = u.candidate_id
     WHERE u.id = $1`,
    [user.id],
  );
  const row = result.rows[0] as ProfileSource | undefined;

  return (
    <section className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Account</p>
        <h1 className="page-title mt-1">My Profile</h1>
      </div>
      {row ? (
        <ProfileWorkspace
          profile={toPublicProfile(
            {
              ...row,
              agent_balance: row.agent_balance ? formatMoney(row.agent_balance) : "",
              sub_balance: row.sub_balance ? formatMoney(row.sub_balance) : "",
            },
            user.id,
          )}
        />
      ) : (
        <p className="surface px-5 py-4 text-[13.5px]">This account could not be loaded.</p>
      )}
    </section>
  );
}
