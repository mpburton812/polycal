/**
 * FastSleep authority (rule B) and validation (PC-379).
 * Scheduler may schedule self arrangements and each direct partner's arrangements
 * (P solo, P–Q, Q solo). Co-sleepers must share a direct partnership with the night subject.
 */

import { getDb } from "@/lib/db/client";
import type { BatchSleepingEntry } from "@/lib/proposals/batch-sleeping";
import {
  assertBatchLocationAllowed,
  getAcceptedSleepingPartnerIds,
  type BatchLocationPolicy,
} from "@/lib/proposals/fast-sleeping-core";

type Db = ReturnType<typeof getDb>;

/**
 * Reachable users under rule B: S ∪ partners(S) ∪ partners-of-partners.
 */
export async function getFastSleepReachableUserIds(
  db: Db,
  schedulerId: string,
  networkId?: string,
): Promise<Set<string>> {
  const reachable = new Set<string>([schedulerId]);
  const direct = await getAcceptedSleepingPartnerIds(db, schedulerId, networkId);
  for (const partnerId of direct) {
    reachable.add(partnerId);
    const secondHop = await getAcceptedSleepingPartnerIds(db, partnerId, networkId);
    for (const id of secondHop) {
      reachable.add(id);
    }
  }
  return reachable;
}

/**
 * Direct partners of the scheduler (used to authorize scheduling P's arrangements).
 */
export async function getFastSleepDirectPartnerIds(
  db: Db,
  schedulerId: string,
  networkId?: string,
): Promise<Set<string>> {
  return getAcceptedSleepingPartnerIds(db, schedulerId, networkId);
}

/**
 * True when subject is scheduler, a direct partner, or a partner-of-partner (rule B).
 */
export function isFastSleepSubjectAuthorized(
  schedulerId: string,
  subjectUserId: string,
  directPartners: ReadonlySet<string>,
  reachable: ReadonlySet<string>,
): boolean {
  if (subjectUserId === schedulerId) return true;
  if (directPartners.has(subjectUserId)) return true;
  // Q solo / Q as subject only when Q is reachable via a partner (not an unrelated user).
  return reachable.has(subjectUserId) && subjectUserId !== schedulerId;
}

/**
 * Validates one FastSleep night: subject authority + invitees are partners of subject.
 */
export async function assertFastSleepNightAllowed(
  db: Db,
  input: {
    schedulerId: string;
    entry: BatchSleepingEntry;
    directPartners: ReadonlySet<string>;
    reachable: ReadonlySet<string>;
    networkId?: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const subjectUserId = input.entry.subjectUserId;
  if (!subjectUserId) {
    return { ok: false, error: "Each FastSleep night needs a subject." };
  }

  if (
    !isFastSleepSubjectAuthorized(
      input.schedulerId,
      subjectUserId,
      input.directPartners,
      input.reachable,
    )
  ) {
    return {
      ok: false,
      error:
        "You can only FastSleep for yourself, your sleeping partners, or people in your partners' arrangements.",
    };
  }

  // Rule B: subject must be scheduler or direct partner for multi-person nights;
  // partner-of-partner may only be scheduled as solo (Q solo), or appear as invitee on P's night.
  const subjectIsSchedulerOrDirect =
    subjectUserId === input.schedulerId || input.directPartners.has(subjectUserId);

  if (input.entry.intentionalSolo || input.entry.invitees.length === 0) {
    if (!input.entry.intentionalSolo && input.entry.invitees.length === 0) {
      return { ok: false, error: "Each configured night needs partners or intentional solo." };
    }
    // Q solo allowed when Q is reachable (partner-of-partner or direct/self).
    if (!input.reachable.has(subjectUserId) && subjectUserId !== input.schedulerId) {
      return { ok: false, error: "That person is outside your FastSleep reach." };
    }
    return { ok: true };
  }

  if (!subjectIsSchedulerOrDirect) {
    return {
      ok: false,
      error:
        "Multi-person FastSleep nights must be owned by you or a direct sleeping partner (not a partner-of-partner as subject with others).",
    };
  }

  const subjectPartners = await getAcceptedSleepingPartnerIds(
    db,
    subjectUserId,
    input.networkId,
  );
  for (const invitee of input.entry.invitees) {
    if (invitee.userId === subjectUserId) {
      return { ok: false, error: "Subject cannot also be listed as an invitee." };
    }
    if (!subjectPartners.has(invitee.userId)) {
      return {
        ok: false,
        error:
          "FastSleep nights can only include people who share an accepted sleeping partnership with the night's subject (no A–C without a direct edge).",
      };
    }
  }

  return { ok: true };
}

/**
 * Validates all FastSleep entries for rule B + location policy (PC-379).
 */
export async function validateFastSleepEntries(
  db: Db,
  input: {
    schedulerId: string;
    schedulerRole: string;
    entries: BatchSleepingEntry[];
    locationPolicy: BatchLocationPolicy;
    networkId?: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.entries.length === 0) {
    return { ok: false, error: "Configure at least one night before submitting." };
  }

  const directPartners = await getFastSleepDirectPartnerIds(
    db,
    input.schedulerId,
    input.networkId,
  );
  const reachable = await getFastSleepReachableUserIds(
    db,
    input.schedulerId,
    input.networkId,
  );

  for (const entry of input.entries) {
    const nightCheck = await assertFastSleepNightAllowed(db, {
      schedulerId: input.schedulerId,
      entry,
      directPartners,
      reachable,
      networkId: input.networkId,
    });
    if (!nightCheck.ok) return nightCheck;

    const subjectUserId = entry.subjectUserId ?? input.schedulerId;
    if (entry.locationId || entry.locationText) {
      const locationCheck = await assertBatchLocationAllowed(
        db,
        subjectUserId,
        input.schedulerRole,
        input.locationPolicy,
        entry.locationId,
        entry.locationText,
      );
      if (!locationCheck.ok) return locationCheck;
    }
  }

  return { ok: true };
}
