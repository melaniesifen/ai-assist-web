import { describe, expect, it } from "vitest";
import { mapUserFacingError } from "../src/error-mapping";

describe("safe error mapping", () => {
  it("maps known categories to safe messages", () => {
    const mapped = mapUserFacingError({
      category: "CONFLICT",
      code: "ORIGINAL_TEXT_HASH_MISMATCH"
    });

    expect(mapped.message).toBe("The source changed before the action was applied. Review the latest version.");
    expect(mapped.retryable).toBe(false);
    expect(mapped.code).toBe("ORIGINAL_TEXT_HASH_MISMATCH");
  });

  it("falls back unknown categories to internal without exposing raw message", () => {
    const mapped = mapUserFacingError({
      category: "RAW_PROVIDER_FAILURE",
      code: "  "
    });

    expect(mapped.category).toBe("INTERNAL");
    expect(mapped.message).toBe("Something went wrong. Try again later.");
    expect(mapped.code).toBe("UNKNOWN");
  });

  it("rejects unsafe error codes", () => {
    const unsafeCodes = [
      "lowercase_raw_text",
      "TOKEN/secret/path",
      "TOKEN EXPIRED",
      "A".repeat(65),
      "provider said key abc"
    ];

    for (const code of unsafeCodes) {
      const mapped = mapUserFacingError({ category: "VALIDATION", code });
      expect(mapped.code).toBe("UNKNOWN");
    }
  });
});
