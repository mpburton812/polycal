import { Typography } from "@mui/material";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { listScheduleEventsAction } from "@/actions/schedule";
import { listPartnershipsForUserAction } from "@/actions/partnerships";
import { listPeopleAction } from "@/actions/users";
import { ScheduleClient } from "@/components/schedule/ScheduleClient";
import { BrandedLoading } from "@/components/ui/BrandedLoading";
import { auth } from "@/lib/auth";
import { endOfWeekSunday, startOfWeekMonday } from "@/lib/schedule/dates";
import { resolveTimezone } from "@/lib/schedule/timezone";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { brutalPageTitleSx } from "@/theme/brutalUi";

export default async function SchedulePage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const weekStart = startOfWeekMonday(new Date());
  const rangeEnd = endOfWeekSunday(weekStart);

  await ensureDbReady();
  const db = getDb();
  const [userRow] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  const timeZone = resolveTimezone(userRow?.timezone);

  const [scheduleResult, people, partnerships] = await Promise.all([
    listScheduleEventsAction({
      rangeStart: weekStart.toISOString(),
      rangeEnd: rangeEnd.toISOString(),
    }),
    listPeopleAction(),
    listPartnershipsForUserAction(session.user.id),
  ]);

  const acceptedPartnerIds = partnerships
    .filter((row) => row.status === "accepted")
    .map((row) => row.partnerId);

  return (
    <>
      <Typography variant="h5" component="h1" gutterBottom sx={brutalPageTitleSx}>
        Schedule
      </Typography>
      <Suspense fallback={<BrandedLoading label="Loading schedule…" />}>
        <ScheduleClient
          initialPayload={scheduleResult.payload}
          initialWeekStartIso={weekStart.toISOString()}
          people={people}
          currentUserId={session.user.id}
          acceptedPartnerIds={acceptedPartnerIds}
          timeZone={timeZone}
        />
      </Suspense>
    </>
  );
}
