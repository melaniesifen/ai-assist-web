export const CONTEXT_MODE_IDS = Object.freeze({
  SELECTION: "SELECTION",
  ACTIVE_RESOURCE: "ACTIVE_RESOURCE",
  VISIBLE_REGION: "VISIBLE_REGION",
  WORKSPACE: "WORKSPACE",
  SCREEN: "SCREEN"
});

export const CONTEXT_MODE_DEFINITIONS = Object.freeze({
  [CONTEXT_MODE_IDS.SELECTION]: {
    label: "Selection",
    description: "Use only the text or range the user explicitly selected.",
    mvpSupported: true,
    requiresGrant: false
  },
  [CONTEXT_MODE_IDS.ACTIVE_RESOURCE]: {
    label: "Active resource",
    description: "Use the currently selected provider resource.",
    mvpSupported: true,
    requiresGrant: true
  },
  [CONTEXT_MODE_IDS.VISIBLE_REGION]: {
    label: "Visible region",
    description: "Future browser-visible context mode.",
    mvpSupported: false,
    requiresGrant: true
  },
  [CONTEXT_MODE_IDS.WORKSPACE]: {
    label: "Workspace",
    description: "Future bounded workspace context mode.",
    mvpSupported: false,
    requiresGrant: true
  },
  [CONTEXT_MODE_IDS.SCREEN]: {
    label: "Screen",
    description: "Future active-window or screen context mode.",
    mvpSupported: false,
    requiresGrant: true
  }
});

export function getContextModeLabel(mode) {
  return CONTEXT_MODE_DEFINITIONS[mode]?.label ?? "Unknown context";
}

export function getContextModeOptions({ activeResourceConnected = false, consentedModes = [] } = {}) {
  const grantSet = new Set(consentedModes);

  return Object.values(CONTEXT_MODE_IDS).map((mode) => {
    const definition = CONTEXT_MODE_DEFINITIONS[mode];
    const needsActiveResource = mode === CONTEXT_MODE_IDS.ACTIVE_RESOURCE;
    const missingResource = needsActiveResource && !activeResourceConnected;
    const missingConsent = definition.requiresGrant && !grantSet.has(mode);
    const disabledReason = !definition.mvpSupported
      ? "Deferred after MVP"
      : missingResource
        ? "Select a resource first"
        : missingConsent
          ? "Consent required"
          : null;

    return {
      mode,
      label: definition.label,
      description: definition.description,
      enabled: disabledReason === null,
      disabledReason
    };
  });
}
