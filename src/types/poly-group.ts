/**
 * @deprecated Import from `@/types/network-settings` instead.
 * Kept for transitional imports during poly_group → networks migration.
 */
export {
  auditLogVisibilityLevels,
  placesMapVisibilityLevels,
  DEFAULT_ONBOARDING_WELCOME_MESSAGE,
  type AuditLogVisibility,
  type PlacesMapVisibility,
  type NetworkSettings,
} from "@/types/network-settings";

/** @deprecated Use {@link NetworkSettings} from `@/types/network-settings`. */
export type { NetworkSettings as PolyGroupSettings } from "@/types/network-settings";
