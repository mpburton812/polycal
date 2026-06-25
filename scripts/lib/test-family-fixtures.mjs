/** Shared Burton-Thompson test fixture expectations for scripts and validation. */
export const TEST_FAMILY_FIXTURE = {
  groupName: "Burton-Thompson",
  password: "password",
  adminLogin: { username: "mpburton", displayName: "Michael Burton" },
  users: [
    { username: "mpburton", displayName: "Michael Burton", role: "admin" },
    { username: "kthompson", displayName: "Katie Thompson", role: "admin" },
    { username: "bailey", displayName: "Bailey", role: "user" },
    { username: "izzy", displayName: "Izzy", role: "user" },
    { username: "zachery", displayName: "Zachery", role: "passive" },
  ],
  locations: ["Michael's Place", "Katie's Place", "Lake House"],
  partnerships: [
    ["mpburton", "kthompson"],
    ["mpburton", "izzy"],
    ["kthompson", "zachery"],
  ],
  expectedCounts: {
    users: 5,
    locations: 3,
    partnerships: 3,
    proposals: 0,
    loginCapableUsers: 4,
  },
};

export const TEST_VERCEL_URL =
  "https://polycal-git-test-michael-burton-s-projects.vercel.app";

export const TEST_TURSO_DATABASE = "polycal-test";
