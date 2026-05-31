export const CONTEXT_MODE_IDS = Object.freeze({
  SELECTION: "SELECTION",
  ACTIVE_RESOURCE: "ACTIVE_RESOURCE",
  VISIBLE_REGION: "VISIBLE_REGION",
  WORKSPACE: "WORKSPACE",
  SCREEN: "SCREEN"
});

export type ContextModeId = (typeof CONTEXT_MODE_IDS)[keyof typeof CONTEXT_MODE_IDS];

type ContextModeDefinition = {
  label: string;
  description: string;
  mvpSupported: boolean;
  requiresGrant: boolean;
};

export type ContextModeOption = {
  mode: ContextModeId;
  label: string;
  description: string;
  enabled: boolean;
  disabledReason: string | null;
};

export const CONTEXT_MODE_DEFINITIONS: Readonly<Record<ContextModeId, ContextModeDefinition>> = Object.freeze({
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

type ContextModeOptionInput = {
  activeResourceConnected?: boolean;
  consentedModes?: readonly ContextModeId[];
};

export function getContextModeLabel(mode: string): string {
  return CONTEXT_MODE_DEFINITIONS[mode as ContextModeId]?.label ?? "Unknown context";
}

export function getContextModeOptions({
  activeResourceConnected = false,
  consentedModes = []
}: ContextModeOptionInput = {}): ContextModeOption[] {
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
