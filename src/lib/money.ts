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
