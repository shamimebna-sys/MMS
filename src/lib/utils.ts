import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function statusLabel(value: unknown): string {
  const raw = displayValue(value).trim();
  if (raw === "A") return "Active";
  if (raw === "I") return "Inactive";
  return raw;
}

export function formatMoney(value: unknown): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "0.00";
  return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function displayValue(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z");
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value).replace(/[ \t]+$/g, "");
}
