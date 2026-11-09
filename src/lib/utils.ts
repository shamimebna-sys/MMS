import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatFixed } from "@/lib/money";

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
  const raw = typeof value === "string" || typeof value === "number" || typeof value === "bigint" ? String(value).trim() : "";
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return "0.00";
  const fixed = formatFixed(raw, 2);
  const negative = fixed.startsWith("-");
  const unsigned = negative ? fixed.slice(1) : fixed;
  const [whole, fraction = "00"] = unsigned.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped}.${fraction}`;
}

export function displayValue(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z");
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value).replace(/[ \t]+$/g, "");
}
