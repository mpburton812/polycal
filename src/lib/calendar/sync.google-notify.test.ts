import { beforeEach, describe, expect, it, vi } from "vitest";

const insertGoogleEvent = vi.fn();
const patchGoogleEvent = vi.fn();
const deleteGoogleEvent = vi.fn();
const notifyUser = vi.fn();
const logUserActivity = vi.fn();
const decryptSecret = vi.fn();
const encryptSecret = vi.fn();
const refreshGoogleAccessToken = vi.fn();
const getDb = vi.fn();
const auth = vi.fn();

vi.mock("@/lib/db/client", () => ({ getDb: (...args: unknown[]) => getDb(...args) }));
vi.mock("@/lib/auth", () => ({ auth: (...args: unknown[]) => auth(...args) }));
vi.mock("@/lib/notifications", () => ({
  notifyUser: (...args: unknown[]) => notifyUser(...args),
}));
vi.mock("@/lib/audit", () => ({
  logUserActivity: (...args: unknown[]) => logUserActivity(...args),
}));
vi.mock("@/lib/calendar/google-api", () => ({
  insertGoogleEvent: (...args: unknown[]) => insertGoogleEvent(...args),
  patchGoogleEvent: (...args: unknown[]) => patchGoogleEvent(...args),
  deleteGoogleEvent: (...args: unknown[]) => deleteGoogleEvent(...args),
}));
vi.mock("@/lib/calendar/crypto", () => ({
  decryptSecret: (...args: unknown[]) => decryptSecret(...args),
  encryptSecret: (...args: unknown[]) => encryptSecret(...args),
  isCalendarEncryptionConfigured: () => true,
}));
vi.mock("@/lib/calendar/google-oauth", () => ({
  refreshGoogleAccessToken: (...args: unknown[]) => refreshGoogleAccessToken(...args),
}));
vi.mock("@/lib/calendar/ics", () => ({
  buildIcsDocument: vi.fn(),
  buildIcsMultiDocument: vi.fn(),
}));
vi.mock("@/lib/email/send", () => ({
  sendEmail: vi.fn(),
}));
vi.mock("@/lib/proposals/special-proposals", () => ({
  isNonScheduleProposal: () => false,
}));
vi.mock("next/server", () => ({
  after: (fn: () => void) => {
    void fn();
  },
}));

import { syncProposalToExternalCalendars } from "@/lib/calendar/sync";

type ProposalFixture = {
  id: string;
  title: string;
  description: string | null;
  proposalType: "event" | "sleeping";
  proposerId: string;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  locationText: string | null;
  isAllDay: boolean;
  isBatchSleeping: boolean;
  batchEntriesJson: string | null;
  intentionalSolo?: boolean;
  state?: string;
  atRisk?: boolean;
};

type ConnectionFixture = {
  id: string;
  userId: string;
  provider: "google" | "ics";
  googleCalendarId: string | null;
  googleRefreshTokenEnc: string | null;
  googleAccessTokenEnc: string | null;
  googleTokenExpiresAt: string | null;
  status: "active" | "needs_reconnect";
  icsDelivery: string | null;
};

function baseProposal(overrides: Partial<ProposalFixture> = {}): ProposalFixture {
  return {
    id: "prop-1",
    title: "Sleeping: Michael ↔ Katie",
    description: null,
    proposalType: "sleeping",
    proposerId: "user-michael",
    scheduledStartAt: "2026-08-01T04:00:00.000Z",
    scheduledEndAt: "2026-08-03T04:00:00.000Z",
    locationText: null,
    isAllDay: true,
    isBatchSleeping: true,
    batchEntriesJson: null,
    intentionalSolo: false,
    state: "resolved",
    atRisk: false,
    ...overrides,
  };
}

function googleConnection(
  userId: string,
  overrides: Partial<ConnectionFixture> = {},
): ConnectionFixture {
  return {
    id: `conn-${userId}`,
    userId,
    provider: "google",
    googleCalendarId: "primary",
    googleRefreshTokenEnc: "enc-refresh",
    googleAccessTokenEnc: "enc-access",
    googleTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    status: "active",
    icsDelivery: null,
    ...overrides,
  };
}

/**
 * Queue-based drizzle stub: each `select().from().where()...` consumes the next
 * queued result. Mutations are no-ops that resolve.
 *
 * Select order after PC-351: proposal → invitees → users(names) → connections → links…
 */
function createQueuedDb(selectResults: unknown[][]) {
  let selectIndex = 0;
  const insertedLinks: unknown[] = [];

  function terminal(rows: unknown[]) {
    return {
      limit: async () => rows,
      orderBy: () => ({
        limit: async () => rows,
      }),
      then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
    };
  }

  return {
    insertedLinks,
    db: {
      select: () => ({
        from: () => ({
          where: () => {
            const rows = selectResults[selectIndex++] ?? [];
            return terminal(rows);
          },
        }),
      }),
      insert: () => ({
        values: async (row: unknown) => {
          insertedLinks.push(row);
        },
      }),
      update: () => ({
        set: () => ({
          where: async () => undefined,
        }),
      }),
      delete: () => ({
        where: async () => undefined,
      }),
    },
  };
}

const nameRows = [
  { id: "user-michael", displayName: "Michael" },
  { id: "user-katie", displayName: "Katie" },
];

describe("syncProposalToExternalCalendars Google notify matrix (PC-346 / PC-347 / PC-351)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.mockResolvedValue({ user: { isImpersonating: false } });
    decryptSecret.mockImplementation((value: string) => `plain:${value}`);
    encryptSecret.mockImplementation((value: string) => `enc:${value}`);
    insertGoogleEvent.mockResolvedValue("gcal-event-1");
    patchGoogleEvent.mockResolvedValue(undefined);
    deleteGoogleEvent.mockResolvedValue(undefined);
    notifyUser.mockResolvedValue(undefined);
    logUserActivity.mockResolvedValue(undefined);
  });

  it("upserts only for the connected proposer when invitee has no Google (one-sided)", async () => {
    const proposal = baseProposal();
    const michael = googleConnection("user-michael");
    const { db, insertedLinks } = createQueuedDb([
      [proposal],
      [{ userId: "user-katie" }],
      nameRows,
      [michael],
      [], // no existing link
    ]);
    getDb.mockReturnValue(db);

    await syncProposalToExternalCalendars("prop-1", "upsert");

    expect(insertGoogleEvent).toHaveBeenCalledTimes(1);
    expect(insertGoogleEvent.mock.calls[0][1]).toBe("primary");
    expect(insertedLinks).toHaveLength(1);
    expect(notifyUser).toHaveBeenCalledWith(
      "user-michael",
      "calendar_google_synced",
      expect.stringContaining("Added to Google Calendar"),
      expect.objectContaining({ proposalId: "prop-1", kind: "added" }),
    );
    expect(notifyUser).not.toHaveBeenCalledWith(
      "user-katie",
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it("upserts for both participants when both have Google", async () => {
    const proposal = baseProposal();
    const michael = googleConnection("user-michael");
    const katie = googleConnection("user-katie", { googleCalendarId: "katie-cal" });
    const { db } = createQueuedDb([
      [proposal],
      [{ userId: "user-katie" }],
      nameRows,
      [michael, katie],
      [], // michael link
      [], // katie link
    ]);
    getDb.mockReturnValue(db);
    insertGoogleEvent
      .mockResolvedValueOnce("gcal-michael")
      .mockResolvedValueOnce("gcal-katie");

    await syncProposalToExternalCalendars("prop-1", "upsert");

    expect(insertGoogleEvent).toHaveBeenCalledTimes(2);
    const calendarIds = insertGoogleEvent.mock.calls.map((call) => call[1]);
    expect(calendarIds).toEqual(["primary", "katie-cal"]);
    expect(notifyUser).toHaveBeenCalledWith(
      "user-michael",
      "calendar_google_synced",
      expect.stringContaining("all-day free night"),
      expect.any(Object),
    );
    expect(notifyUser).toHaveBeenCalledWith(
      "user-katie",
      "calendar_google_synced",
      expect.stringContaining("Added to Google Calendar"),
      expect.any(Object),
    );
  });

  it("inserts one Google event per batch night (PC-351)", async () => {
    const proposal = baseProposal({
      batchEntriesJson: JSON.stringify([
        {
          id: "n1",
          nightDate: "2026-08-01",
          locationText: "Pad A",
          invitees: [{ userId: "user-katie", role: "required" }],
        },
        {
          id: "n2",
          nightDate: "2026-08-02",
          locationText: "Pad B",
          invitees: [{ userId: "user-katie", role: "required" }],
        },
      ]),
    });
    const michael = googleConnection("user-michael");
    const { db, insertedLinks } = createQueuedDb([
      [proposal],
      [{ userId: "user-katie" }],
      nameRows,
      [michael],
      [],
    ]);
    getDb.mockReturnValue(db);
    insertGoogleEvent
      .mockResolvedValueOnce("g1")
      .mockResolvedValueOnce("g2");

    await syncProposalToExternalCalendars("prop-1", "upsert");

    expect(insertGoogleEvent).toHaveBeenCalledTimes(2);
    expect(insertedLinks).toHaveLength(2);
    expect(notifyUser).toHaveBeenCalledWith(
      "user-michael",
      "calendar_google_synced",
      expect.stringContaining("2 all-day free nights"),
      expect.any(Object),
    );
  });

  it("notifies failure and skips insert when googleCalendarId is null", async () => {
    const proposal = baseProposal({ isBatchSleeping: false });
    const incomplete = googleConnection("user-michael", { googleCalendarId: null });
    const { db } = createQueuedDb([
      [proposal],
      [{ userId: "user-katie" }],
      nameRows,
      [incomplete],
    ]);
    getDb.mockReturnValue(db);

    await syncProposalToExternalCalendars("prop-1", "upsert");

    expect(insertGoogleEvent).not.toHaveBeenCalled();
    expect(notifyUser).toHaveBeenCalledWith(
      "user-michael",
      "calendar_google_failed",
      expect.stringContaining("pick a calendar"),
      expect.objectContaining({ url: "/profile" }),
    );
  });

  it("notifies failure when Google API insert throws", async () => {
    const proposal = baseProposal({ title: "Dinner", isBatchSleeping: false });
    const michael = googleConnection("user-michael");
    const { db } = createQueuedDb([[proposal], [], nameRows, [michael], []]);
    getDb.mockReturnValue(db);
    insertGoogleEvent.mockRejectedValue(new Error("Google events.insert failed: 403"));

    await syncProposalToExternalCalendars("prop-1", "upsert");

    expect(logUserActivity).toHaveBeenCalledWith(
      "user-michael",
      "calendar.sync_failed",
      expect.stringContaining("403"),
      "system",
    );
    expect(notifyUser).toHaveBeenCalledWith(
      "user-michael",
      "calendar_google_failed",
      expect.stringContaining("Could not sync"),
      expect.any(Object),
    );
  });

  it("notifies the proposer when no participants have calendar connections", async () => {
    const proposal = baseProposal();
    const { db } = createQueuedDb([
      [proposal],
      [{ userId: "user-katie" }],
      nameRows,
      [], // no connections
    ]);
    getDb.mockReturnValue(db);

    await syncProposalToExternalCalendars("prop-1", "upsert");

    expect(insertGoogleEvent).not.toHaveBeenCalled();
    expect(notifyUser).toHaveBeenCalledWith(
      "user-michael",
      "calendar_google_failed",
      expect.stringContaining("No calendar integration is connected"),
      expect.objectContaining({ reason: "no_connections" }),
    );
  });
});
