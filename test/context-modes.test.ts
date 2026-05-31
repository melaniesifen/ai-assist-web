import { describe, expect, it } from "vitest";
import { CONTEXT_MODE_IDS, getContextModeLabel, getContextModeOptions } from "../src/context-modes";

describe("context mode helpers", () => {
  it("labels known and unknown context modes safely", () => {
    expect(getContextModeLabel(CONTEXT_MODE_IDS.SELECTION)).toBe("Selection");
    expect(getContextModeLabel("BAD_MODE")).toBe("Unknown context");
  });

  it("enables selection without grant and requires resource consent for active resource", () => {
    const options = getContextModeOptions({ activeResourceConnected: true, consentedModes: [] });
    const selection = options.find((option) => option.mode === CONTEXT_MODE_IDS.SELECTION);
    const activeResource = options.find((option) => option.mode === CONTEXT_MODE_IDS.ACTIVE_RESOURCE);

    expect(selection?.enabled).toBe(true);
    expect(activeResource?.enabled).toBe(false);
    expect(activeResource?.disabledReason).toBe("Consent required");
  });

  it("keeps future modes disabled even when included in consent list", () => {
    const options = getContextModeOptions({
      activeResourceConnected: true,
      consentedModes: [CONTEXT_MODE_IDS.WORKSPACE]
    });
    const workspace = options.find((option) => option.mode === CONTEXT_MODE_IDS.WORKSPACE);

    expect(workspace?.enabled).toBe(false);
    expect(workspace?.disabledReason).toBe("Deferred after MVP");
  });
});
