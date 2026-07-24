import { Box, Link as MuiLink, Paper, Typography } from "@mui/material";
import type { Metadata } from "next";
import NextLink from "next/link";
import type { ReactNode } from "react";

import { brutalPaperSx, brutalPageTitleSx, brutalSectionTitleSx } from "@/theme/brutalUi";
import { GARDEN_TOKENS } from "@/theme/tokens";

export const metadata: Metadata = {
  title: "Privacy Policy · PolyCal",
  description:
    "How PolyCal collects, stores, shares, and deletes account, schedule, and calendar data.",
};

const EFFECTIVE_DATE = "July 23, 2026";

/**
 * Public privacy policy for OAuth consent screens and in-app disclosure (PC-344).
 * Content tracks the live schema and integrations (Auth.js, Turso, Resend, VAPID, Google Calendar).
 */
export default function PrivacyPolicyPage() {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: GARDEN_TOKENS.background,
        py: { xs: 3, sm: 5 },
        px: 2,
      }}
    >
      <Paper elevation={0} sx={{ ...brutalPaperSx, maxWidth: 720, mx: "auto" }}>
        <Typography variant="h4" component="h1" gutterBottom sx={brutalPageTitleSx}>
          Privacy Policy
        </Typography>
        <Typography sx={{ mb: 1, color: GARDEN_TOKENS.inkMuted }}>
          PolyCal (&quot;we&quot;, &quot;us&quot;) is a private-group scheduling application.
          This policy describes how we handle information in the running service, based on the
          product&apos;s database schema, authentication, and configured integrations.
        </Typography>
        <Typography sx={{ mb: 3, color: GARDEN_TOKENS.inkMuted }}>
          Effective date: {EFFECTIVE_DATE}
        </Typography>

        <Section title="1. Who this applies to">
          <Typography paragraph>
            PolyCal is used by members of a private polyamorous (or similar) group. Accounts are
            created by group administrators; there is no public self-service signup. If you use
            PolyCal, you are sharing scheduling and relationship-context data with other members
            of that group according to the rules below.
          </Typography>
        </Section>

        <Section title="2. Information we store">
          <Typography paragraph>
            We store data needed to run scheduling, messaging, and optional external calendar sync
            in our application database (SQLite locally, or a hosted libSQL/Turso database when
            configured).
          </Typography>
          <Typography fontWeight={600} sx={{ mb: 0.5 }}>
            Account and profile
          </Typography>
          <Box component="ul" sx={{ mt: 0, mb: 2, pl: 2.5 }}>
            <li>Username, display name, optional profile bio, avatar image, theme preference, and time zone</li>
            <li>Password stored only as a one-way bcrypt hash (never in plain text)</li>
            <li>Role and account status (for example active, paused, or deleted)</li>
            <li>Optional gender field when set by an administrator</li>
            <li>Optional notification email address and whether it has been verified</li>
            <li>Notification and feed preference settings</li>
            <li>Login-related metadata such as last login time and login count</li>
            <li>Short-lived tokens for email verification and password reset</li>
          </Box>
          <Typography fontWeight={600} sx={{ mb: 0.5 }}>
            Scheduling and group content
          </Typography>
          <Box component="ul" sx={{ mt: 0, mb: 2, pl: 2.5 }}>
            <li>Event and sleeping proposals (titles, descriptions, notes, times, recurrence, locations, icons)</li>
            <li>Invitees, votes, poll time slots, comments, and attached images</li>
            <li>Places (including optional street address and bedroom labels) and residency relationships</li>
            <li>Sleeping-partner relationships within the group</li>
            <li>Feed / network chat messages, comments, likes, link previews, and images</li>
            <li>In-app notification dismissals and an append-only activity log of important account and app actions</li>
            <li>Optional product-feedback submissions (text, screenshots, and basic device diagnostics when you send feedback)</li>
          </Box>
          <Typography fontWeight={600} sx={{ mb: 0.5 }}>
            Sessions and security
          </Typography>
          <Box component="ul" sx={{ mt: 0, mb: 2, pl: 2.5 }}>
            <li>
              Signed-in sessions use Auth.js JWT cookies that are HttpOnly (and Secure in
              production). Session tokens are not stored in browser LocalStorage or SessionStorage.
            </li>
            <li>
              Rate-limit records may temporarily associate IP addresses with login or password-reset
              attempts to reduce abuse.
            </li>
          </Box>
        </Section>

        <Section id="google" title="3. Google user data (Calendar connection)">
          <Typography paragraph>
            Connecting Google Calendar is optional. Google is used only for calendar sync — not as
            your PolyCal login. The use of information received from Google APIs will adhere to the{" "}
            <MuiLink
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google API Services User Data Policy
            </MuiLink>
            , including the Limited Use requirements. That information is used solely to provide or
            improve the user-facing Google Calendar sync feature in PolyCal.
          </Typography>

          <Typography fontWeight={600} sx={{ mb: 0.5 }}>
            Access
          </Typography>
          <Typography paragraph>
            With your consent we request these scopes:
          </Typography>
          <Box component="ul" sx={{ mt: 0, mb: 2, pl: 2.5 }}>
            <li>
              <code>https://www.googleapis.com/auth/calendar.events</code> — create, update, and
              delete only the events PolyCal syncs on your behalf
            </li>
            <li>
              <code>https://www.googleapis.com/auth/calendar.calendarlist.readonly</code> — list
              calendars you can write to so you can choose a target calendar
            </li>
          </Box>
          <Typography paragraph>
            We also read your Google account email (userinfo) to show which Google account is
            connected. We do not import or store the contents of your existing Google Calendar
            events into PolyCal.
          </Typography>

          <Typography fontWeight={600} sx={{ mb: 0.5 }}>
            Use
          </Typography>
          <Typography paragraph>
            Sync is one-way from PolyCal → your chosen Google calendar for proposals you are
            involved in (as proposer or invitee). We write titles, descriptions, times, location
            text, and related metadata derived from PolyCal; sleeping arrangements export as all-day
            free/transparent events with the PolyCal sleeping title. We do not use Google user data
            for advertising, analytics products, credit decisions, or to train generalized AI/ML
            models.
          </Typography>

          <Typography fontWeight={600} sx={{ mb: 0.5 }}>
            Storage
          </Typography>
          <Typography paragraph>
            We store: your Google account email, the selected calendar id, encrypted OAuth access
            and refresh tokens (AES-256-GCM at rest), and mapping rows that link PolyCal proposals to
            Google event ids we created. Tokens are never stored in browser LocalStorage.
          </Typography>

          <Typography fontWeight={600} sx={{ mb: 0.5 }}>
            Sharing
          </Typography>
          <Typography paragraph>
            Google OAuth tokens and Google Calendar API responses are not shared with other PolyCal
            group members, sold, or transferred to advertising or data-broker platforms. Event
            content written into your Google calendar may reflect PolyCal group scheduling data you
            already see in the app.
          </Typography>

          <Typography fontWeight={600} sx={{ mb: 0.5 }}>
            Human access (Limited Use)
          </Typography>
          <Typography paragraph>
            Limited Use restricts humans from reading Google user data except in narrow
            security/legal cases. PolyCal administrators do not have access to any Google Calendar
            information (tokens, calendar lists, or Google event payloads). Admin impersonation of
            another user disables all Google Calendar API and OAuth calls for that session so an
            administrator cannot connect, list, sync, or disconnect Google Calendar while
            impersonating.
          </Typography>

          <Typography fontWeight={600} sx={{ mb: 0.5 }}>
            Deletion
          </Typography>
          <Typography paragraph>
            In Profile &amp; Settings you can disconnect calendar integration. Disconnecting (or an
            administrator deleting your account) revokes the Google OAuth token when possible,
            deletes encrypted tokens and Google account/calendar fields from PolyCal, and deletes
            local Google event-id mappings. Events already written to your Google Calendar remain
            there until you delete them in Google Calendar (or revoke PolyCal in your{" "}
            <MuiLink
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google Account permissions
            </MuiLink>
            ).
          </Typography>
        </Section>

        <Section title="4. Optional iCal / email calendar delivery">
          <Typography paragraph>
            Instead of (or in addition to workflows involving) Google, you may configure iCal (.ics)
            delivery: download in the app, email attachment to your verified notification email, or
            both. Pending .ics payloads may be stored briefly until you download them.
          </Typography>
        </Section>

        <Section title="5. Email and push notifications">
          <Typography paragraph>
            When email is configured for the deployment, transactional and notification messages are
            sent through Resend using the deployment&apos;s configured &quot;from&quot; address.
            That can include verification links, password-reset links, credential notices,
            schedule/notification alerts you opted into, and calendar .ics attachments.
          </Typography>
          <Typography paragraph>
            When web push is configured, PolyCal stores browser push subscription endpoints and keys
            so we can deliver notifications you enable. Push payloads may include short titles,
            bodies, and deep links into the app.
          </Typography>
          <Typography paragraph>
            An SMS preference may exist in notification settings for future use; the current product
            does not send SMS unless a provider is later configured.
          </Typography>
        </Section>

        <Section title="6. How we use information">
          <Typography paragraph>We use stored information to:</Typography>
          <Box component="ul" sx={{ mt: 0, mb: 2, pl: 2.5 }}>
            <li>Authenticate you and keep your session secure</li>
            <li>Operate group scheduling, voting, feed chat, and people/places features</li>
            <li>
              Enforce group visibility rules (for example masking sleeping details from uninvolved
              members when enabled)
            </li>
            <li>Send the notifications and calendar sync you configure</li>
            <li>Allow administrators to manage accounts and group settings</li>
            <li>Investigate abuse, fix bugs, and maintain the service (including activity logs)</li>
          </Box>
          <Typography paragraph>
            We do not sell personal information. We do not use third-party advertising or analytics
            SDKs in the product.
          </Typography>
        </Section>

        <Section title="7. Sharing within your group and with processors">
          <Typography paragraph>
            <strong>Within your PolyCal group:</strong> other members (and administrators) can see
            content according to product rules — for example open proposals, feed posts you make,
            places, and sleeping details when they are involved or when admin visibility settings
            apply. PolyCal is a shared group tool; treat it as visible to your group, not private
            from them.
          </Typography>
          <Typography paragraph>
            <strong>Service processors</strong> (only when the deployment enables them):
          </Typography>
          <Box component="ul" sx={{ mt: 0, mb: 2, pl: 2.5 }}>
            <li>Hosted database provider (Turso/libSQL) — stores application data</li>
            <li>Hosting provider (for example Vercel) — runs the web application</li>
            <li>Resend — delivers email</li>
            <li>Google — OAuth and Calendar API when you connect Google Calendar</li>
            <li>Browser push services (via the Web Push protocol and VAPID keys) when you enable push</li>
          </Box>
          <Typography paragraph>
            Administrators can manage PolyCal accounts and group settings, but they do not receive
            Google Calendar tokens or Google Calendar contents. Impersonation cannot call Google
            Calendar APIs (see Google user data above).
          </Typography>
        </Section>

        <Section title="8. Retention and deletion">
          <Typography paragraph>
            We retain account and scheduling data for as long as your account remains in the group
            database and the service is operated. Administrators can pause or delete accounts
            according to admin tools. Password-reset and email-verification tokens expire
            automatically. When you disconnect Google Calendar or an administrator deletes your
            account, PolyCal revokes Google OAuth tokens when possible and deletes Google-related
            connection fields and event-id mappings. Activity logs and feedback submissions may be
            retained for operational history. Events previously synced into Google Calendar are not
            automatically removed from Google.
          </Typography>
          <Typography paragraph>
            To request correction or deletion of your account data, contact your PolyCal group
            administrator. They can update profile fields and change account status through the
            admin tools.
          </Typography>
        </Section>

        <Section title="9. Security">
          <Typography paragraph>
            We use hashed passwords, HttpOnly session cookies, encrypted Google OAuth tokens at
            rest, server-side validation of inputs, and deny-by-default authorization checks on
            protected routes and actions. No method of transmission or storage is perfectly secure;
            protect your password and device access.
          </Typography>
        </Section>

        <Section title="10. Children">
          <Typography paragraph>
            PolyCal is intended for adults in a private group. It is not directed at children under
            13, and we do not knowingly collect personal information from children.
          </Typography>
        </Section>

        <Section title="11. Changes">
          <Typography paragraph>
            We may update this policy as the product changes. The effective date at the top will be
            revised when material changes are published at this URL.
          </Typography>
        </Section>

        <Section title="12. Contact">
          <Typography paragraph>
            For privacy questions or data requests, contact your PolyCal group administrator.
            Technical operators of a deployment can also be reached through the contact channels
            published for that instance (for example the support email used on the Google OAuth
            consent screen).
          </Typography>
        </Section>

        <Typography sx={{ mt: 4 }}>
          <MuiLink component={NextLink} href="/login" underline="hover">
            Back to sign in
          </MuiLink>
        </Typography>
      </Paper>
    </Box>
  );
}

function Section({
  title,
  children,
  id,
}: {
  title: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <Box id={id} sx={{ mb: 3, scrollMarginTop: 24 }}>
      <Typography variant="h6" component="h2" gutterBottom sx={brutalSectionTitleSx}>
        {title}
      </Typography>
      <Box sx={{ color: GARDEN_TOKENS.ink, "& ul": { mt: 0.5, mb: 1.5, pl: 2.5 } }}>{children}</Box>
    </Box>
  );
}
