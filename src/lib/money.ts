/** Exact decimal addition for reconciliation. Values stay strings, never binary floats. */
export function addDecimal(left: string, right: string): string {
  const [aSign, aInt, aFrac] = splitDecimal(left);
  const [bSign, bInt, bFrac] = splitDecimal(right);
  const scale = Math.max(aFrac.length, bFrac.length);
  const a = BigInt(aSign + (aInt + aFrac.padEnd(scale, "0") || "0"));
  const b = BigInt(bSign + (bInt + bFrac.padEnd(scale, "0") || "0"));
  const sum = a + b;
  const negative = sum < BigInt(0);
  const digits = (negative ? -sum : sum).toString().padStart(scale + 1, "0");
  const whole = digits.slice(0, digits.length - scale) || "0";
  const fraction = scale ? digits.slice(digits.length - scale).replace(/0+$/, "") : "";
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function splitDecimal(value: string): [string, string, string] {
  const trimmed = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid decimal value: ${trimmed}`);
  }
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole, fraction = ""] = unsigned.split(".");
  return [negative ? "-" : "", whole.replace(/^0+(?=\d)/, "") || "0", fraction];
}

export function decimalEquals(left: string, right: string): boolean {
  return addDecimal(left, "0") === addDecimal(right, "0");
}

export function negateDecimal(value: string): string {
  const normalized = addDecimal(value, "0");
  if (normalized === "0") return "0";
  return normalized.startsWith("-") ? normalized.slice(1) : `-${normalized}`;
}

export function isZeroDecimal(value: string): boolean {
  return addDecimal(value, "0") === "0";
}

export function subtractDecimal(left: string, right: string): string {
  return addDecimal(left, negateDecimal(right));
}

export function decimalGreaterThan(left: string, right: string): boolean {
  const difference = subtractDecimal(left, right);
  return difference !== "0" && !difference.startsWith("-");
}

/** Wallet and payment amounts are accepted with at most four decimal places. */
export function isPositiveAmount(value: string): boolean {
  if (!/^\d+(\.\d{1,4})?$/.test(value)) return false;
  return !isZeroDecimal(value);
}

/**
 * Divide and round half away from zero to `scale` decimal places.
 * The result is a canonical decimal string, never a binary float.
 */
export function divideDecimal(left: string, right: string, scale: number): string {
  if (!Number.isInteger(scale) || scale < 0 || scale > 20) throw new Error("Invalid decimal scale.");
  const zero = BigInt(0);
  const one = BigInt(1);
  const five = BigInt(5);
  const ten = BigInt(10);
  const divisor = parseDecimal(right);
  if (divisor.digits === zero) throw new Error("Cannot divide by zero.");
  const dividend = parseDecimal(left);
  const negative = dividend.negative !== divisor.negative;
  const exponent = divisor.scale - dividend.scale + scale + 1;
  let numerator = dividend.digits;
  let denominator = divisor.digits;
  if (exponent >= 0) numerator *= ten ** BigInt(exponent);
  else denominator *= ten ** BigInt(-exponent);
  const quotient = numerator / denominator;
  let rounded = quotient / ten;
  const digit = quotient % ten;
  if (digit >= five) rounded += one;
  return formatScaled(rounded, scale, negative && rounded !== zero);
}

export function roundDecimal(value: string, scale: number): string {
  return divideDecimal(value, "1", scale);
}

/** Fixed-scale decimal text. Trailing zeros are kept for display. */
export function formatFixed(value: string, scale: number): string {
  const negative = addDecimal(value, "0").startsWith("-") && !isZeroDecimal(value);
  const rounded = roundDecimal(value, scale);
  const unsigned = rounded.startsWith("-") ? rounded.slice(1) : rounded;
  const [whole, fraction = ""] = unsigned.split(".");
  if (scale === 0) return `${negative ? "-" : ""}${whole}`;
  return `${negative ? "-" : ""}${whole}.${fraction.padEnd(scale, "0")}`;
}

function parseDecimal(value: string): { negative: boolean; digits: bigint; scale: number } {
  const normalized = addDecimal(value, "0");
  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [whole, fraction = ""] = unsigned.split(".");
  return { negative: negative && unsigned !== "0", digits: BigInt(`${whole}${fraction}`), scale: fraction.length };
}

function formatScaled(digits: bigint, scale: number, negative: boolean): string {
  const raw = digits.toString().padStart(scale + 1, "0");
  const whole = (scale === 0 ? raw : raw.slice(0, raw.length - scale)).replace(/^0+(?=\d)/, "") || "0";
  const fraction = scale === 0 ? "" : raw.slice(raw.length - scale).replace(/0+$/, "");
  const text = fraction ? `${whole}.${fraction}` : whole;
  if (text === "0") return "0";
  return `${negative ? "-" : ""}${text}`;
}
