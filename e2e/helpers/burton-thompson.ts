/** Burton-Thompson overlay users for E2E journeys (seeded on top of Star Wars). */
export const BURTON_THOMPSON_PASSWORD = "password";

export const BT_USERS = {
  katie: {
    username: "kthompson",
    displayName: "Katie Thompson",
    id: "tf-kthompson",
  },
  michael: {
    username: "mpburton",
    displayName: "Michael Burton",
    id: "tf-mpburton",
  },
} as const;

export const BT_PLACES = {
  katiesPlace: "Katie's Place",
  michaelsPlace: "Michael's Place",
} as const;
