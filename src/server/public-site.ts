import { pool } from "@/lib/db";

export type PublicJob = { id: number; code: string; name: string; description: string };
export type PublicPost = { title: string; slug: string; excerpt: string; body: string; date: string; image: string };
export type PublicCandidate = { id: number; name: string; role: string; abroad: number; local: number; english: number | null; photo: string };

export type PublicHome = {
  candidates: number;
  jobs: number;
  employers: number;
  selected: number;
  posts: PublicPost[];
  hotJobs: PublicJob[];
};

function plain(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export async function loadPublicHome(): Promise<PublicHome> {
  const [counts, posts, jobs] = await Promise.all([
    pool.query(
      `SELECT
         (SELECT count(*)::int FROM candidates WHERE deleted_at IS NULL) AS candidates,
         (SELECT count(*)::int FROM class_groups WHERE btrim(coalesce(name, '')) <> '' AND (status IS NULL OR btrim(status) LIKE 'A%')) AS jobs,
         (SELECT count(*)::int FROM employers) AS employers,
         (SELECT count(*)::int FROM selected_candidates) AS selected`,
    ),
    pool.query(
      `SELECT title, slug, coalesce(excerpt, '') AS excerpt, body, coalesce(to_char(created_at, 'DD Mon YYYY'), '') AS date, coalesce(image, '') AS image
       FROM posts WHERE status = 'PUBLISHED' ORDER BY id DESC LIMIT 3`,
    ),
    pool.query(
      `SELECT id, coalesce(code, '') AS code, name, coalesce(description, '') AS description
       FROM class_groups
       WHERE btrim(coalesce(name, '')) <> '' AND (status IS NULL OR btrim(status) LIKE 'A%')
       ORDER BY id DESC LIMIT 6`,
    ),
  ]);
  const row = counts.rows[0] as { candidates: number; jobs: number; employers: number; selected: number };
  return {
    candidates: row.candidates,
    jobs: row.jobs,
    employers: row.employers,
    selected: row.selected,
    posts: (posts.rows as PublicPost[]).map((post) => ({ ...post, excerpt: plain(post.excerpt), body: plain(post.body), image: post.image ?? "" })),
    hotJobs: jobs.rows as PublicJob[],
  };
}

export async function listPublicJobs(q: string): Promise<PublicJob[]> {
  const rows = await pool.query(
    `SELECT id, coalesce(code, '') AS code, name, coalesce(description, '') AS description
     FROM class_groups
     WHERE btrim(coalesce(name, '')) <> ''
       AND (status IS NULL OR btrim(status) LIKE 'A%')
       AND ($1 = '' OR name ILIKE $2 OR coalesce(code, '') ILIKE $2)
     ORDER BY id DESC
     LIMIT 60`,
    [q, `%${q}%`],
  );
  return rows.rows as PublicJob[];
}

export async function readPublicJob(id: number): Promise<PublicJob | null> {
  const rows = await pool.query(
    `SELECT id, coalesce(code, '') AS code, name, coalesce(description, '') AS description
     FROM class_groups WHERE id = $1 AND btrim(coalesce(name, '')) <> ''`,
    [id],
  );
  return (rows.rows[0] as PublicJob | undefined) ?? null;
}

export async function listPublicPosts(): Promise<PublicPost[]> {
  const rows = await pool.query(
    `SELECT title, slug, coalesce(excerpt, '') AS excerpt, body, coalesce(to_char(created_at, 'DD Mon YYYY'), '') AS date, coalesce(image, '') AS image
     FROM posts WHERE status = 'PUBLISHED' ORDER BY id DESC`,
  );
  return (rows.rows as PublicPost[]).map((post) => ({ ...post, excerpt: plain(post.excerpt), body: plain(post.body), image: post.image ?? "" }));
}

export async function readPublicPost(slug: string): Promise<PublicPost | null> {
  const rows = await pool.query(
    `SELECT title, slug, coalesce(excerpt, '') AS excerpt, body, coalesce(to_char(created_at, 'DD Mon YYYY'), '') AS date, coalesce(image, '') AS image
     FROM posts WHERE slug = $1 AND status = 'PUBLISHED'`,
    [slug],
  );
  const post = rows.rows[0] as PublicPost | undefined;
  if (!post) return null;
  return { ...post, excerpt: plain(post.excerpt), body: plain(post.body), image: post.image ?? "" };
}

export async function listPublicCandidates(q: string, page: number): Promise<{ rows: PublicCandidate[]; total: number }> {
  const size = 12;
  const offset = Math.max(page - 1, 0) * size;
  const filter = q ? `%${q}%` : "";
  const total = await pool.query(
    `SELECT count(*)::int AS total FROM candidates c
     WHERE c.deleted_at IS NULL AND btrim(coalesce(c.name, '')) <> ''
       AND ($1 = '' OR c.name ILIKE $2)`,
    [q, filter],
  );
  const rows = await pool.query(
    `SELECT c.id, c.name,
            coalesce(nullif(btrim(c.position), ''), g.name, 'Open role') AS role,
            coalesce(c.abroad_ex, 0) AS abroad,
            coalesce(c.local_ex, 0) AS local,
            (SELECT english FROM exam_results er WHERE er.candidate_id = c.id AND english IS NOT NULL ORDER BY er.id DESC LIMIT 1) AS english,
            coalesce(nullif(btrim(c.half_photo_file_path), ''), nullif(btrim(c.full_photo_file_path), ''), '') AS photo
     FROM candidates c
     LEFT JOIN class_groups g ON g.id = c.class_group_id
     WHERE c.deleted_at IS NULL AND btrim(coalesce(c.name, '')) <> ''
       AND ($1 = '' OR c.name ILIKE $2)
     ORDER BY c.id DESC
     LIMIT $3 OFFSET $4`,
    [q, filter, size, offset],
  );
  return { rows: rows.rows as PublicCandidate[], total: Number(total.rows[0]?.total ?? 0) };
}
