export type { BatchSleepingEntry } from "./batch-sleeping";

/** Client-safe batch entry id (batch-sleeping.ts uses node:crypto for server). */
export function newBatchEntryId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `bse-${crypto.randomUUID()}`;
  }
  return `bse-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
