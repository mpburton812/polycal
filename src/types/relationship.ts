/** Sleeping partnership lifecycle — full proposal workflow in later phases. */
export const partnershipStatuses = ["proposed", "accepted", "declined"] as const;
export type PartnershipStatus = (typeof partnershipStatuses)[number];

/** Place residency association lifecycle. */
export const residencyStatuses = ["proposed", "accepted", "declined"] as const;
export type ResidencyStatus = (typeof residencyStatuses)[number];
