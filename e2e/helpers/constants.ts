/** Star Wars seed credentials (non-production only). */
export const SEED_PASSWORD = "ChangeMe123!";

export const USERS = {
  luke: { username: "luke", displayName: "Luke Skywalker", id: "sw-luke" },
  leia: { username: "leia", displayName: "Leia Organa", id: "sw-leia" },
  han: { username: "han", displayName: "Han Solo", id: "sw-han" },
  yoda: { username: "yoda", displayName: "Yoda", id: "sw-yoda" },
  vader: { username: "vader", displayName: "Darth Vader", id: "sw-vader" },
  lando: { username: "lando", displayName: "Lando Calrissian", id: "sw-lando" },
  badUser: { username: "bad_user", displayName: "Bad User", id: "sw-bad-user" },
} as const;

/** Demo proposal fixtures from `demo-proposals.ts`. */
export const DEMO = {
  draftJediCouncil: "Jedi Council briefing",
  draftDagobah: "Dagobah training weekend",
  proposedRescueHan: "Rescue Han from carbonite",
  proposedFalcon: "Falcon overnight — Tatooine",
  proposedDeathStar: "Death Star planning session",
  resolvedCelebration: "Yavin 4 victory celebration",
  resolvedCloudCity: "Cloud City hospitality suite",
  archivedEndor: "Cancelled Endor camping trip",
} as const;
