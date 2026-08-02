/**
 * @deprecated Import from `@/actions/network-settings` instead.
 */
export {
  getNetworkDisplayNameAction,
  getNetworkSettingsAction,
  updateNetworkSettingsAction,
  getPlacesMapVisibilityAction,
  type NetworkSettingsActionResult,
} from "@/actions/network-settings";

/** @deprecated Use {@link getNetworkDisplayNameAction}. */
export { getNetworkDisplayNameAction as getPolyGroupDisplayNameAction } from "@/actions/network-settings";

/** @deprecated Use {@link getNetworkSettingsAction}. */
export { getNetworkSettingsAction as getPolyGroupSettingsAction } from "@/actions/network-settings";

/** @deprecated Use {@link updateNetworkSettingsAction}. */
export { updateNetworkSettingsAction as updatePolyGroupSettingsAction } from "@/actions/network-settings";

/** @deprecated Use {@link NetworkSettingsActionResult}. */
export type { NetworkSettingsActionResult as PolyGroupActionResult } from "@/actions/network-settings";
