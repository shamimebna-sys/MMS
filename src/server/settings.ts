import type { AccessUser } from "@/lib/auth/permissions";
import { pool } from "@/lib/db";
import {
  canOperateSetting,
  isLegacySettingKey,
  nextSettingValue,
  type LegacySettingKey,
} from "@/lib/settings";
import type { FormField } from "@/server/bread-form";
import type { BreadRecord } from "@/server/browse";

type SettingRow = {
  id: number;
  key: string;
  display_name: string;
  value: string | null;
  type: string;
  group: string | null;
};

const DENIED = "You do not have access to this module.";
const REFUSED = "You cannot edit this setting.";
const SAVE_FAILED = "Could not save this setting.";

function refused(error: unknown): boolean {
  return error instanceof Error && (error.message === DENIED || error.message === REFUSED || error.message === "Enter a valid setting value." || error.message === "This setting value is too long.");
}

function settingId(id: number): number {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error(REFUSED);
  return id;
}

async function readRow(id: number): Promise<SettingRow | null> {
  const result = await pool.query(
    `SELECT id, key, display_name, value, type, "group"
     FROM settings
     WHERE id = $1`,
    [id],
  );
  const row = result.rows[0] as SettingRow | undefined;
  return row ?? null;
}

function storedType(type: string): "text" | "image" | null {
  if (type === "text" || type === "image") return type;
  return null;
}

export async function readSetting(user: AccessUser, id: number): Promise<BreadRecord | null> {
  if (!canOperateSetting(user, "read")) throw new Error(DENIED);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  let row: SettingRow | null;
  try {
    row = await readRow(id);
  } catch {
    throw new Error("Could not load this setting.");
  }
  if (!row || !isLegacySettingKey(row.key)) return null;
  return {
    title: "Settings",
    slug: "settings",
    table: "settings",
    id: row.id,
    fields: [
      { label: "Key", value: row.key },
      { label: "Display Name", value: row.display_name },
      { label: "Group", value: row.group ?? "" },
      { label: "Type", value: row.type },
      { label: "Value", value: row.value ?? "" },
    ],
  };
}

export async function loadSettingForm(user: AccessUser, id: number): Promise<{ title: string; slug: string; fields: FormField[] } | null> {
  if (!canOperateSetting(user, "edit")) throw new Error(DENIED);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  let row: SettingRow | null;
  try {
    row = await readRow(id);
  } catch {
    throw new Error("Could not load this setting.");
  }
  if (!row || !isLegacySettingKey(row.key) || !storedType(row.type)) return null;
  return {
    title: row.display_name || row.key,
    slug: "settings",
    fields: [
      {
        name: "value",
        label: row.display_name || "Value",
        input: "text",
        required: false,
        multiple: false,
        options: [],
        value: row.value ?? "",
      },
    ],
  };
}

export async function saveSettingValue(user: AccessUser, id: number, submitted: string): Promise<number> {
  if (!canOperateSetting(user, "edit")) throw new Error(DENIED);
  const recordId = settingId(id);
  try {
    const row = await readRow(recordId);
    if (!row || !isLegacySettingKey(row.key)) throw new Error(REFUSED);
    const type = storedType(row.type);
    if (!type) throw new Error(REFUSED);
    const value = nextSettingValue(row.value, submitted, type);
    const updated = await pool.query(
      `UPDATE settings
       SET value = $1
       WHERE id = $2 AND key = $3 AND type = $4
       RETURNING id`,
      [value, recordId, row.key satisfies LegacySettingKey, type],
    );
    if (!updated.rows[0]) throw new Error(REFUSED);
    return recordId;
  } catch (error) {
    if (refused(error)) throw error;
    throw new Error(SAVE_FAILED);
  }
}
