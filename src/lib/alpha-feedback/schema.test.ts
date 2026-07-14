import { describe, expect, it } from "vitest";

import {
  ALPHA_FEEDBACK_STATUS_COLORS,
  ALPHA_FEEDBACK_STATUS_LABELS,
  alphaFeedbackPatchSchema,
  alphaFeedbackSubmitSchema,
  decodeScreenshotPayload,
  parseOsLabel,
} from "@/lib/alpha-feedback/schema";
import {
  issueAdminApiToken,
  verifyAdminApiToken,
} from "@/lib/alpha-feedback/admin-token";

describe("alphaFeedbackSubmitSchema", () => {
  it("accepts a valid bug submission", () => {
    const parsed = alphaFeedbackSubmitSchema.safeParse({
      kind: "bug",
      title: "Calendar blank",
      description: "Week view shows empty after refresh.",
      pagePath: "/schedule",
      viewportWidth: 390,
      viewportHeight: 844,
      consoleLogTail: ["[error] boom"],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects empty title", () => {
    const parsed = alphaFeedbackSubmitSchema.safeParse({
      kind: "feature",
      title: "   ",
      description: "Need dark mode",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("alphaFeedbackPatchSchema", () => {
  it("accepts status and comments", () => {
    const parsed = alphaFeedbackPatchSchema.safeParse({
      status: "in_progress",
      internalComment: "Repro on iOS",
      submitterComment: "Looking into it",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts ready_for_testing status", () => {
    const parsed = alphaFeedbackPatchSchema.safeParse({
      status: "ready_for_testing",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts archived flag", () => {
    const parsed = alphaFeedbackPatchSchema.safeParse({ archived: true });
    expect(parsed.success).toBe(true);
  });

  it("rejects unknown status", () => {
    const parsed = alphaFeedbackPatchSchema.safeParse({ status: "done" });
    expect(parsed.success).toBe(false);
  });
});

describe("parseOsLabel / decodeScreenshotPayload / labels", () => {
  it("parses common user agents", () => {
    expect(parseOsLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("Windows");
    expect(parseOsLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)")).toBe("macOS");
    expect(parseOsLabel(undefined)).toBe("Unknown");
  });

  it("decodes base64 screenshots within size limits", () => {
    const payload = Buffer.from("fake-jpeg").toString("base64");
    const decoded = decodeScreenshotPayload(payload, "image/jpeg");
    expect(decoded?.mimeType).toBe("image/jpeg");
    expect(decoded?.data.toString()).toBe("fake-jpeg");
  });

  it("returns null for oversized screenshots", () => {
    const huge = Buffer.alloc(1_600_000, 1).toString("base64");
    expect(decodeScreenshotPayload(huge, "image/jpeg")).toBeNull();
  });

  it("exposes human-readable status labels", () => {
    expect(ALPHA_FEEDBACK_STATUS_LABELS.working_as_designed).toBe(
      "Working As Designed",
    );
    expect(ALPHA_FEEDBACK_STATUS_LABELS.ready_for_testing).toBe(
      "Ready For Testing",
    );
    expect(ALPHA_FEEDBACK_STATUS_COLORS.ready_for_testing).toBe("success");
  });
});

describe("admin API token", () => {
  it("round-trips a signed admin bearer token", () => {
    const previous = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = "test-secret-for-alpha-feedback";
    try {
      const token = issueAdminApiToken({
        id: "user-admin",
        role: "admin",
        displayName: "Admin",
      });
      const verified = verifyAdminApiToken(token);
      expect(verified).toEqual({
        id: "user-admin",
        role: "admin",
        displayName: "Admin",
      });
      expect(verifyAdminApiToken(`${token}x`)).toBeNull();
    } finally {
      if (previous === undefined) delete process.env.AUTH_SECRET;
      else process.env.AUTH_SECRET = previous;
    }
  });
});
