/** Sleeping partnership lifecycle — full proposal workflow in later phases. */
export const partnershipStatuses = ["proposed", "accepted", "declined"] as const;
export type PartnershipStatus = (typeof partnershipStatuses)[number];

/** Place residency association lifecycle. */
export const residencyStatuses = ["proposed", "accepted", "declined"] as const;
export type ResidencyStatus = (typeof residencyStatuses)[number];

/** Membership role at a place — owners approve self-joins (PC-185+). */
export const placeRoles = ["owner", "resident"] as const;
export type PlaceRole = (typeof placeRoles)[number];
