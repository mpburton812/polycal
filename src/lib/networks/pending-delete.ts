import { eq } from "drizzle-orm";

import { logUserActivity } from "@/lib/audit";
import { getDb } from "@/lib/db/client";
import { networks, users } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email/send";
import { buildNotificationEmailContent } from "@/lib/email/templates";
import { getPublicAppUrl } from "@/lib/env";
import { purgeNetwork } from "@/lib/networks/purge";
import { parseNotificationPrefs } from "@/types/notification-prefs";

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * T-1h Sponsor email (once) and hard-wipe after pendingDeleteAt (PC-462).
 * SMS is skipped — that channel is not implemented.
 */
export async function runPendingNetworkDeletes(now = Date.now()): Promise<{
  notified: number;
  wiped: number;
}> {
  const db = getDb();
  const nowIso = new Date(now).toISOString();
  let notified = 0;
  let wiped = 0;

  const closing = await db
    .select({
      id: networks.id,
      name: networks.name,
      sponsorUserId: networks.sponsorUserId,
      pendingDeleteAt: networks.pendingDeleteAt,
      pendingDeleteNotifyAt: networks.pendingDeleteNotifyAt,
    })
    .from(networks)
    .where(eq(networks.status, "pending_delete"));

  for (const network of closing) {
    if (!network.pendingDeleteAt) continue;
    const wipeAt = new Date(network.pendingDeleteAt).getTime();
    if (Number.isNaN(wipeAt)) continue;

    if (wipeAt <= now) {
      const result = await purgeNetwork(network.id);
      if (result.ok) wiped += 1;
      continue;
    }

    if (network.pendingDeleteNotifyAt) continue;
    if (wipeAt - now > ONE_HOUR_MS) continue;
    if (!network.sponsorUserId) continue;

    const [sponsor] = await db
      .select({
        id: users.id,
        notificationEmail: users.notificationEmail,
        emailVerifiedAt: users.emailVerifiedAt,
        notificationPrefsJson: users.notificationPrefsJson,
      })
      .from(users)
      .where(eq(users.id, network.sponsorUserId))
      .limit(1);
    if (!sponsor?.notificationEmail || !sponsor.emailVerifiedAt) {
      await db
        .update(networks)
        .set({ pendingDeleteNotifyAt: nowIso, updatedAt: nowIso })
        .where(eq(networks.id, network.id));
      continue;
    }

    const prefs = parseNotificationPrefs(sponsor.notificationPrefsJson);
    if (!prefs.globalEnabled || !prefs.channels.email) {
      await db
        .update(networks)
        .set({ pendingDeleteNotifyAt: nowIso, updatedAt: nowIso })
        .where(eq(networks.id, network.id));
      continue;
    }

    const content = buildNotificationEmailContent({
      title: "Network closing in one hour",
      message: `${network.name} will be permanently deleted in about one hour.`,
      url: `${getPublicAppUrl()}/admin`,
    });
    await sendEmail({
      to: sponsor.notificationEmail,
      subject: content.subject,
      html: content.html,
      text: content.text,
    });
    await db
      .update(networks)
      .set({ pendingDeleteNotifyAt: nowIso, updatedAt: nowIso })
      .where(eq(networks.id, network.id));
    await logUserActivity(
      sponsor.id,
      "networks.delete_notify",
      JSON.stringify({ networkId: network.id }),
      "system",
    );
    notified += 1;
  }

  return { notified, wiped };
}
