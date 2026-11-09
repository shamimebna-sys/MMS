export type SelectedBanner = {
  id: number;
  name: string;
  position: string;
  passportNo: string;
  photo: string;
};

export type SelectedBannerRow = {
  id: number;
  name: string | null;
  position: string | null;
  passport_no: string | null;
  photo: string | null;
};

export function presentSelectedBanner(row: SelectedBannerRow): SelectedBanner | null {
  const id = Number(row.id);
  if (!Number.isInteger(id)) return null;
  return {
    id,
    name: row.name?.trim() || "Candidate",
    position: row.position?.trim() || "",
    passportNo: row.passport_no?.trim() || "",
    photo: row.photo?.trim() || "",
  };
}

/** Field cleanup for banner rows. Duplicate selection rows are removed in SQL. */
export function presentSelectedBanners(rows: readonly SelectedBannerRow[]): SelectedBanner[] {
  const banners: SelectedBanner[] = [];
  for (const row of rows) {
    const banner = presentSelectedBanner(row);
    if (banner) banners.push(banner);
  }
  return banners;
}

/** Keep the newest selection row for each candidate. Input must already be newest-first. */
export function uniqueSelectedBanners(rows: readonly SelectedBannerRow[]): SelectedBanner[] {
  const seen = new Set<number>();
  const banners: SelectedBanner[] = [];
  for (const row of rows) {
    const banner = presentSelectedBanner(row);
    if (!banner || seen.has(banner.id)) continue;
    seen.add(banner.id);
    banners.push(banner);
  }
  return banners;
}
