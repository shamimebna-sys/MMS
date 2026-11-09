import { createElement, forwardRef, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CandidateJourney } from "@/components/records/candidate-journey";
import {
  journeyCompletionFromSource,
  journeyStepCompleted,
  journeyStepVisual,
  type JourneyCompletion,
} from "@/lib/candidate-journey-status";

vi.mock("next/link", () => ({
  default: forwardRef<HTMLAnchorElement, { href: string; children?: ReactNode }>(function Link({ href, children, ...props }, ref) {
    return createElement("a", { ...props, href, ref }, children);
  }),
}));

const onVisa: JourneyCompletion = {
  police: true,
  medical: false,
  visa: true,
  manpower: false,
};

describe("candidate journey status", () => {
  it("marks an earlier step completed only when that step's own record is saved", () => {
    expect(journeyStepVisual(3, 5, onVisa)).toBe("completed");
    expect(journeyStepCompleted(3, onVisa)).toBe(true);
    expect(journeyCompletionFromSource({ police: true }).police).toBe(true);
  });

  it("leaves an earlier step incomplete when the candidate is already on a later step", () => {
    expect(journeyStepVisual(4, 5, onVisa)).toBe("pending");
    expect(journeyStepVisual(3, 7, { flight: true, police: false })).toBe("pending");
    expect(journeyStepCompleted(4, onVisa)).toBe(false);
  });

  it("shows the current step as the current step", () => {
    expect(journeyStepVisual(5, 5, onVisa)).toBe("current");
    expect(journeyStepVisual(5, 5, { visa: false })).toBe("current");
  });

  it("keeps future steps pending", () => {
    expect(journeyStepVisual(6, 5, onVisa)).toBe("pending");
    expect(journeyStepVisual(7, 5, onVisa)).toBe("pending");
    expect(journeyStepVisual(9, 5, { labour: false })).toBe("pending");
    expect(journeyStepVisual(7, 5, { flight: true })).toBe("pending");
  });

  it("does not treat missing completion data as completed", () => {
    expect(journeyStepVisual(1, 6, undefined)).toBe("pending");
    expect(journeyStepVisual(2, 6, {})).toBe("pending");
    expect(journeyStepVisual(3, 6, { visa: true })).toBe("pending");
    expect(journeyStepCompleted(8, undefined)).toBe(false);
    expect(journeyStepCompleted(11, {})).toBe(false);
    expect(journeyStepCompleted(4, { medical: undefined })).toBe(false);

    const fromBlank = journeyCompletionFromSource(undefined);
    expect(fromBlank.basicInfo).toBeUndefined();
    expect(fromBlank.passportStamp).toBeUndefined();
    expect(journeyStepCompleted(2, fromBlank)).toBe(false);

    const fromPartial = journeyCompletionFromSource({ stamp: "saved.pdf", police: 1, medical: null });
    expect(fromPartial.passportStamp).toBeUndefined();
    expect(fromPartial.police).toBeUndefined();
    expect(fromPartial.medical).toBeUndefined();
    expect(journeyStepVisual(2, 4, fromPartial)).toBe("pending");
    expect(journeyStepVisual(3, 4, fromPartial)).toBe("pending");
  });

  it("reads each journey step from its own saved record", () => {
    const completion = journeyCompletionFromSource({
      stamp: true,
      police: false,
      medical: true,
      visa: true,
      manpowerTraining: true,
      flight: false,
      arc: true,
      labour: true,
      document: true,
      paymentRequest: false,
    });
    expect(completion).toEqual({
      passportStamp: true,
      police: false,
      medical: true,
      visa: true,
      manpower: true,
      flight: false,
      arc: true,
      labour: true,
      document: true,
      payment: false,
    });
    expect(completion.basicInfo).toBeUndefined();
    expect(journeyStepVisual(2, 7, completion)).toBe("completed");
    expect(journeyStepVisual(6, 7, completion)).toBe("completed");
    expect(journeyStepVisual(7, 7, completion)).toBe("current");
    expect(journeyStepVisual(11, 7, completion)).toBe("pending");
  });

  it("renders completed, current, and pending steps from those records", () => {
    const html = renderToStaticMarkup(
      createElement(CandidateJourney, {
        step: 5,
        completion: { police: true, medical: false, visa: true },
        steps: [
          { step: 3, label: "Police Clearance", href: "/records/police-clearances?candidate=9" },
          { step: 4, label: "Medical & Ministry", href: "/records/medicals?candidate=9" },
          { step: 5, label: "Visa Immigration", href: "/records/visa-immigrations?candidate=9" },
          { step: 6, label: "Manpower", href: "/records/manpower-trainings?candidate=9" },
        ],
      }),
    );

    expect(html).toContain('aria-current="step"');
    expect(html).toContain("Visa Immigration");
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).toContain("lucide-check");
    expect(html).not.toContain(">03<");
    expect(html).toContain(">04<");
    expect(html).toContain(">05<");
    expect(html).toContain(">06<");
    expect(html.match(/<svg/g)).toHaveLength(1);

    const withoutRecords = renderToStaticMarkup(
      createElement(CandidateJourney, {
        step: 5,
        steps: [
          { step: 3, label: "Police Clearance", href: "/records/police-clearances?candidate=9" },
          { step: 4, label: "Medical & Ministry", href: "/records/medicals?candidate=9" },
          { step: 5, label: "Visa Immigration", href: "/records/visa-immigrations?candidate=9" },
        ],
      }),
    );
    expect(withoutRecords).not.toContain("lucide-check");
    expect(withoutRecords).toContain(">03<");
    expect(withoutRecords).toContain(">04<");
    expect(withoutRecords).toContain('aria-current="step"');
  });
});
