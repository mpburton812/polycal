import { expect, testManualDb as test } from "./helpers/test";

import { login, logout } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { resetE2eDatabase } from "./helpers/db";
import { goToProposals } from "./helpers/navigation";
import {
  castInviteeVote,
  createAndSubmitSoloAllDayEvent,
  createAndSubmitSoloRecurringAllDayEvent,
  createAndSubmitSoloRecurringTimedEvent,
  createAndSubmitSoloTimedEvent,
  createAndSubmitTimedEventWithInvitee,
  expectResolvedProposal,
  moveDraftEventDates,
  moveResolvedEventByRedraft,
} from "./helpers/proposals";
import {
  assertEventVisibleInAllScheduleViews,
  dateOffsetIso,
  oneHourEventWindow,
  shiftIsoDate,
} from "./helpers/schedule";

const COMMENT = "E2E schedule journey comment";

test.describe("Event schedule views journey", () => {
  test.describe.configure({ mode: "serial" });

  // One seed for the whole serial file — unique titles avoid cross-test bleed (PC-214).
  test.beforeAll(async ({ request }) => {
    await resetE2eDatabase(request);
  });

  test("1 — solo 1-hour event: auto-resolve, all views, move +1 day", async ({ page }) => {
    test.setTimeout(300_000);

    const title = `E2E Solo Timed ${Date.now()}`;
    const initial = oneHourEventWindow(14, 11);
    const moved = oneHourEventWindow(15, 11);

    await login(page, USERS.luke.username);
    await goToProposals(page);
    await createAndSubmitSoloTimedEvent(page, {
      title,
      comment: COMMENT,
      start: initial.start,
      end: initial.end,
    });
    await expectResolvedProposal(page, title);
    await assertEventVisibleInAllScheduleViews(page, new RegExp(title, "i"), initial.day);

    await moveResolvedEventByRedraft(page, title, {
      start: moved.start,
      end: moved.end,
    });
    await expectResolvedProposal(page, title);
    await assertEventVisibleInAllScheduleViews(page, new RegExp(title, "i"), moved.day);
  });

  test("2 — solo all-day event: auto-resolve, all views, move +1 day", async ({ page }) => {
    test.setTimeout(300_000);

    const title = `E2E Solo All-day ${Date.now()}`;
    const initialDay = dateOffsetIso(3);
    const movedDay = shiftIsoDate(initialDay, 1);

    await login(page, USERS.luke.username);
    await goToProposals(page);
    await createAndSubmitSoloAllDayEvent(page, {
      title,
      comment: COMMENT,
      day: initialDay,
    });
    await expectResolvedProposal(page, title);
    await assertEventVisibleInAllScheduleViews(page, new RegExp(title, "i"), initialDay);

    await moveResolvedEventByRedraft(page, title, {
      start: movedDay,
      end: movedDay,
      allDay: true,
    });
    await expectResolvedProposal(page, title);
    await assertEventVisibleInAllScheduleViews(page, new RegExp(title, "i"), movedDay);
  });

  test("3 — solo recurring 1-hour weekly: auto-resolve, all views, move +1 day", async ({ page }) => {
    test.setTimeout(300_000);

    const title = `E2E Solo Recurring Timed ${Date.now()}`;
    const initial = oneHourEventWindow(18, 12);
    const moved = oneHourEventWindow(19, 12);

    await login(page, USERS.luke.username);
    await goToProposals(page);
    await createAndSubmitSoloRecurringTimedEvent(page, {
      title,
      comment: COMMENT,
      start: initial.start,
      end: initial.end,
      occurrenceCount: 4,
    });
    await expectResolvedProposal(page, title);
    await assertEventVisibleInAllScheduleViews(page, new RegExp(title, "i"), initial.day);

    await moveResolvedEventByRedraft(page, title, {
      start: moved.start,
      end: moved.end,
    });
    await expectResolvedProposal(page, title);
    await assertEventVisibleInAllScheduleViews(page, new RegExp(title, "i"), moved.day);
  });

  test("4 — solo recurring weekly: auto-resolve, all views, move +1 day", async ({ page }) => {
    test.setTimeout(300_000);

    const title = `E2E Solo Recurring Weekly ${Date.now()}`;
    const initialDay = dateOffsetIso(20);
    const movedDay = shiftIsoDate(initialDay, 1);

    await login(page, USERS.luke.username);
    await goToProposals(page);
    await createAndSubmitSoloRecurringAllDayEvent(page, {
      title,
      comment: COMMENT,
      day: initialDay,
      occurrenceCount: 4,
    });
    await expectResolvedProposal(page, title);
    await assertEventVisibleInAllScheduleViews(page, new RegExp(title, "i"), initialDay);

    await moveResolvedEventByRedraft(page, title, {
      start: movedDay,
      end: movedDay,
      allDay: true,
    });
    await expectResolvedProposal(page, title);
    await assertEventVisibleInAllScheduleViews(page, new RegExp(title, "i"), movedDay);
  });

  test("5 — required invitee accepts, all views, move +1 day", async ({ page }) => {
    test.setTimeout(300_000);

    const title = `E2E Required Accept ${Date.now()}`;
    const initial = oneHourEventWindow(22, 13);
    const moved = oneHourEventWindow(23, 13);

    await login(page, USERS.luke.username);
    await goToProposals(page);
    await createAndSubmitTimedEventWithInvitee(page, {
      title,
      comment: COMMENT,
      inviteeName: USERS.leia.displayName,
      inviteeRole: "required",
      start: initial.start,
      end: initial.end,
    });

    await logout(page);
    await login(page, USERS.leia.username);
    await goToProposals(page);
    await castInviteeVote(page, {
      title,
      tab: "Proposed",
      vote: "Accept",
      comment: COMMENT,
    });

    await logout(page);
    await login(page, USERS.luke.username);
    await goToProposals(page);
    await expectResolvedProposal(page, title);
    await assertEventVisibleInAllScheduleViews(page, new RegExp(title, "i"), initial.day);

    await moveResolvedEventByRedraft(page, title, {
      start: moved.start,
      end: moved.end,
    });

    await logout(page);
    await login(page, USERS.leia.username);
    await goToProposals(page);
    await castInviteeVote(page, {
      title,
      tab: "Proposed",
      vote: "Accept",
      comment: COMMENT,
    });

    await logout(page);
    await login(page, USERS.luke.username);
    await goToProposals(page);
    await expectResolvedProposal(page, title);
    await assertEventVisibleInAllScheduleViews(page, new RegExp(title, "i"), moved.day);
  });

  test("6 — optional invitee accepts, all views, move +1 day", async ({ page }) => {
    test.setTimeout(300_000);

    const title = `E2E Optional Accept ${Date.now()}`;
    const initial = oneHourEventWindow(24, 14);
    const moved = oneHourEventWindow(25, 14);

    await login(page, USERS.luke.username);
    await goToProposals(page);
    await createAndSubmitTimedEventWithInvitee(page, {
      title,
      comment: COMMENT,
      inviteeName: USERS.leia.displayName,
      inviteeRole: "optional",
      start: initial.start,
      end: initial.end,
    });

    await logout(page);
    await login(page, USERS.leia.username);
    await goToProposals(page);
    await castInviteeVote(page, {
      title,
      tab: "Proposed",
      vote: "Accept",
      comment: COMMENT,
    });

    await logout(page);
    await login(page, USERS.luke.username);
    await goToProposals(page);
    await expectResolvedProposal(page, title);
    await assertEventVisibleInAllScheduleViews(page, new RegExp(title, "i"), initial.day);

    await moveResolvedEventByRedraft(page, title, {
      start: moved.start,
      end: moved.end,
    });
    await expectResolvedProposal(page, title);
    await assertEventVisibleInAllScheduleViews(page, new RegExp(title, "i"), moved.day);
  });

  test("7 — required invitee abstains, all views, move +1 day", async ({ page }) => {
    test.setTimeout(300_000);

    const title = `E2E Required Abstain ${Date.now()}`;
    const initial = oneHourEventWindow(26, 15);
    const moved = oneHourEventWindow(27, 15);

    await login(page, USERS.luke.username);
    await goToProposals(page);
    await createAndSubmitTimedEventWithInvitee(page, {
      title,
      comment: COMMENT,
      inviteeName: USERS.leia.displayName,
      inviteeRole: "required",
      start: initial.start,
      end: initial.end,
    });

    await logout(page);
    await login(page, USERS.leia.username);
    await goToProposals(page);
    await castInviteeVote(page, {
      title,
      tab: "Proposed",
      vote: "Abstain",
      comment: COMMENT,
    });

    await logout(page);
    await login(page, USERS.luke.username);
    await goToProposals(page);
    await expectResolvedProposal(page, title);
    await assertEventVisibleInAllScheduleViews(page, new RegExp(title, "i"), initial.day);

    await moveResolvedEventByRedraft(page, title, {
      start: moved.start,
      end: moved.end,
    });

    await logout(page);
    await login(page, USERS.leia.username);
    await goToProposals(page);
    await castInviteeVote(page, {
      title,
      tab: "Proposed",
      vote: "Abstain",
      comment: COMMENT,
    });

    await logout(page);
    await login(page, USERS.luke.username);
    await goToProposals(page);
    await expectResolvedProposal(page, title);
    await assertEventVisibleInAllScheduleViews(page, new RegExp(title, "i"), moved.day);
  });

  test("8 — optional invitee abstains, all views, move +1 day", async ({ page }) => {
    test.setTimeout(300_000);

    const title = `E2E Optional Abstain ${Date.now()}`;
    const initial = oneHourEventWindow(28, 16);
    const moved = oneHourEventWindow(29, 16);

    await login(page, USERS.luke.username);
    await goToProposals(page);
    await createAndSubmitTimedEventWithInvitee(page, {
      title,
      comment: COMMENT,
      inviteeName: USERS.leia.displayName,
      inviteeRole: "optional",
      start: initial.start,
      end: initial.end,
    });

    await logout(page);
    await login(page, USERS.leia.username);
    await goToProposals(page);
    await castInviteeVote(page, {
      title,
      tab: "Proposed",
      vote: "Abstain",
      comment: COMMENT,
    });

    await logout(page);
    await login(page, USERS.luke.username);
    await goToProposals(page);
    await expectResolvedProposal(page, title);
    await assertEventVisibleInAllScheduleViews(page, new RegExp(title, "i"), initial.day);

    await moveResolvedEventByRedraft(page, title, {
      start: moved.start,
      end: moved.end,
    });
    await expectResolvedProposal(page, title);
    await assertEventVisibleInAllScheduleViews(page, new RegExp(title, "i"), moved.day);
  });

  test("9 — required decline, move +1 day, invitee accepts, all views", async ({ page }) => {
    test.setTimeout(300_000);

    const title = `E2E Decline Then Accept ${Date.now()}`;
    const initial = oneHourEventWindow(30, 9);
    const moved = oneHourEventWindow(31, 9);

    await login(page, USERS.luke.username);
    await goToProposals(page);
    await createAndSubmitTimedEventWithInvitee(page, {
      title,
      comment: COMMENT,
      inviteeName: USERS.leia.displayName,
      inviteeRole: "required",
      start: initial.start,
      end: initial.end,
    });

    await logout(page);
    await login(page, USERS.leia.username);
    await goToProposals(page);
    await castInviteeVote(page, {
      title,
      tab: "Proposed",
      vote: "Decline",
      comment: COMMENT,
    });

    await logout(page);
    await login(page, USERS.luke.username);
    await goToProposals(page);
    await moveDraftEventDates(page, title, {
      start: moved.start,
      end: moved.end,
    });

    await logout(page);
    await login(page, USERS.leia.username);
    await goToProposals(page);
    await castInviteeVote(page, {
      title,
      tab: "Proposed",
      vote: "Accept",
      comment: COMMENT,
    });

    await logout(page);
    await login(page, USERS.luke.username);
    await goToProposals(page);
    await expectResolvedProposal(page, title);
    await assertEventVisibleInAllScheduleViews(page, new RegExp(title, "i"), moved.day);
  });

  test("10 — required decline, move +1 day, invitee abstains, all views", async ({ page }) => {
    test.setTimeout(300_000);

    const title = `E2E Decline Then Abstain ${Date.now()}`;
    const initial = oneHourEventWindow(32, 10);
    const moved = oneHourEventWindow(33, 10);

    await login(page, USERS.luke.username);
    await goToProposals(page);
    await createAndSubmitTimedEventWithInvitee(page, {
      title,
      comment: COMMENT,
      inviteeName: USERS.leia.displayName,
      inviteeRole: "required",
      start: initial.start,
      end: initial.end,
    });

    await logout(page);
    await login(page, USERS.leia.username);
    await goToProposals(page);
    await castInviteeVote(page, {
      title,
      tab: "Proposed",
      vote: "Decline",
      comment: COMMENT,
    });

    await logout(page);
    await login(page, USERS.luke.username);
    await goToProposals(page);
    await moveDraftEventDates(page, title, {
      start: moved.start,
      end: moved.end,
    });

    await logout(page);
    await login(page, USERS.leia.username);
    await goToProposals(page);
    await castInviteeVote(page, {
      title,
      tab: "Proposed",
      vote: "Abstain",
      comment: COMMENT,
    });

    await logout(page);
    await login(page, USERS.luke.username);
    await goToProposals(page);
    await expectResolvedProposal(page, title);
    await assertEventVisibleInAllScheduleViews(page, new RegExp(title, "i"), moved.day);
  });
});
