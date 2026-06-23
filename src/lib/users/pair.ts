/**
 * Canonical undirected user pair ordering so sleeping partnerships stay unique.
 */
export function canonicalUserPair(userA: string, userB: string): [string, string] {
  return userA < userB ? [userA, userB] : [userB, userA];
}
