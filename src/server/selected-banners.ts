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

/** Keep the newest selection row for each candidate. Input must already be newest-first. */
export function uniqueSelectedBanners(rows: readonly SelectedBannerRow[]): SelectedBanner[] {
  const seen = new Set<number>();
  const banners: SelectedBanner[] = [];
  for (const row of rows) {
    const id = Number(row.id);
    if (!Number.isInteger(id) || seen.has(id)) continue;
    seen.add(id);
    banners.push({
      id,
      name: row.name?.trim() || "Candidate",
      position: row.position?.trim() || "",
      passportNo: row.passport_no?.trim() || "",
      photo: row.photo?.trim() || "",
    });
  }
  return banners;
}
