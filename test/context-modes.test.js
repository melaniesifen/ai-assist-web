import test from "node:test";
import assert from "node:assert/strict";
import { CONTEXT_MODE_IDS, getContextModeLabel, getContextModeOptions } from "../src/context-modes.js";

test("labels known and unknown context modes safely", () => {
  assert.equal(getContextModeLabel(CONTEXT_MODE_IDS.SELECTION), "Selection");
  assert.equal(getContextModeLabel("BAD_MODE"), "Unknown context");
});

test("enables selection without grant and requires resource consent for active resource", () => {
  const options = getContextModeOptions({ activeResourceConnected: true, consentedModes: [] });
  const selection = options.find((option) => option.mode === CONTEXT_MODE_IDS.SELECTION);
  const activeResource = options.find((option) => option.mode === CONTEXT_MODE_IDS.ACTIVE_RESOURCE);

  assert.equal(selection.enabled, true);
  assert.equal(activeResource.enabled, false);
  assert.equal(activeResource.disabledReason, "Consent required");
});

test("keeps future modes disabled even when included in consent list", () => {
  const options = getContextModeOptions({
    activeResourceConnected: true,
    consentedModes: [CONTEXT_MODE_IDS.WORKSPACE]
  });
  const workspace = options.find((option) => option.mode === CONTEXT_MODE_IDS.WORKSPACE);

  assert.equal(workspace.enabled, false);
  assert.equal(workspace.disabledReason, "Deferred after MVP");
});
