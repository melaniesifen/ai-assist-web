import test from "node:test";
import assert from "node:assert/strict";
import { mapUserFacingError } from "../src/error-mapping.js";

test("maps known categories to safe messages", () => {
  const mapped = mapUserFacingError({
    category: "CONFLICT",
    code: "ORIGINAL_TEXT_HASH_MISMATCH",
    message: "raw document text"
  });

  assert.equal(mapped.message, "The source changed before the action was applied. Review the latest version.");
  assert.equal(mapped.retryable, false);
  assert.equal(mapped.code, "ORIGINAL_TEXT_HASH_MISMATCH");
});

test("falls back unknown categories to internal without exposing raw message", () => {
  const mapped = mapUserFacingError({
    category: "RAW_PROVIDER_FAILURE",
    code: "  ",
    message: "provider said secret abc"
  });

  assert.equal(mapped.category, "INTERNAL");
  assert.equal(mapped.message, "Something went wrong. Try again later.");
  assert.equal(mapped.code, "UNKNOWN");
});

test("rejects unsafe error codes", () => {
  const unsafeCodes = [
    "lowercase_raw_text",
    "TOKEN/secret/path",
    "TOKEN EXPIRED",
    "A".repeat(65),
    "provider said key abc"
  ];

  for (const code of unsafeCodes) {
    const mapped = mapUserFacingError({ category: "VALIDATION", code });
    assert.equal(mapped.code, "UNKNOWN");
  }
});
