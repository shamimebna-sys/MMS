/**
 * Candidate journey completion.
 * The open page is the current step, and later pages stay pending.
 * An earlier page is completed only when its own saved record says so.
 */
export type JourneyCompletion = {
  basicInfo?: boolean;
  passportStamp?: boolean;
  police?: boolean;
  medical?: boolean;
  visa?: boolean;
  manpower?: boolean;
  flight?: boolean;
  arc?: boolean;
  labour?: boolean;
  document?: boolean;
  payment?: boolean;
};

export type JourneyStepVisual = "current" | "completed" | "pending";

/** Saved facts already loaded for a candidate file. Absent values are not completion. */
export type JourneySource = {
  stamp?: unknown;
  police?: unknown;
  medical?: unknown;
  visa?: unknown;
  manpowerTraining?: unknown;
  flight?: unknown;
  arc?: unknown;
  labour?: unknown;
  document?: unknown;
  paymentRequest?: unknown;
};

const KEY_BY_STEP: Record<number, keyof JourneyCompletion> = {
  1: "basicInfo",
  2: "passportStamp",
  3: "police",
  4: "medical",
  5: "visa",
  6: "manpower",
  7: "flight",
  8: "arc",
  9: "labour",
  10: "document",
  11: "payment",
};

function saved(value: unknown): boolean | undefined {
  if (value === true) return true;
  if (value === false) return false;
  return undefined;
}

/**
 * Maps each journey step to the record that already means that step is on file.
 * Basic info has no separate saved completion flag on the candidate file.
 * Passport uses the stamp file. Manpower uses a manpower training row.
 * Payment uses a payment request row, not an approved manpower bill.
 */
export function journeyCompletionFromSource(source: JourneySource | null | undefined): JourneyCompletion {
  if (!source) return {};
  return {
    passportStamp: saved(source.stamp),
    police: saved(source.police),
    medical: saved(source.medical),
    visa: saved(source.visa),
    manpower: saved(source.manpowerTraining),
    flight: saved(source.flight),
    arc: saved(source.arc),
    labour: saved(source.labour),
    document: saved(source.document),
    payment: saved(source.paymentRequest),
  };
}

export function journeyStepCompleted(stepNumber: number, completion: JourneyCompletion | undefined): boolean {
  const key = KEY_BY_STEP[stepNumber];
  if (!key || !completion) return false;
  return completion[key] === true;
}

export function journeyStepVisual(
  stepNumber: number,
  currentStep: number,
  completion: JourneyCompletion | undefined,
): JourneyStepVisual {
  if (stepNumber === currentStep) return "current";
  if (stepNumber > currentStep) return "pending";
  if (journeyStepCompleted(stepNumber, completion)) return "completed";
  return "pending";
}
