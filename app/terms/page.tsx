import { Box, Link as MuiLink, Paper, Typography } from "@mui/material";
import type { Metadata } from "next";
import NextLink from "next/link";
import type { ReactNode } from "react";

import { brutalPaperSx, brutalPageTitleSx, brutalSectionTitleSx } from "@/theme/brutalUi";
import { GARDEN_TOKENS } from "@/theme/tokens";

export const metadata: Metadata = {
  title: "Terms of Service · PolyCal",
  description:
    "The terms that govern use of PolyCal — eligibility, acceptable use, account deletion, and disclaimers.",
};

const EFFECTIVE_DATE = "July 25, 2026";

/**
 * Public terms of service required for app-store and PWA distribution review (PC-354).
 * Mirrors the privacy policy layout so both public documents read as one set.
 */
export default function TermsOfServicePage() {
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
          Terms of Service
        </Typography>
        <Typography sx={{ mb: 1, color: GARDEN_TOKENS.inkMuted }}>
          These terms govern your use of PolyCal (&quot;the service&quot;), a private-group
          scheduling application. By signing in you agree to them. If you do not agree, do not
          use the service.
        </Typography>
        <Typography sx={{ mb: 3, color: GARDEN_TOKENS.inkMuted }}>
          Effective date: {EFFECTIVE_DATE}
        </Typography>

        <Section title="1. Eligibility and age rating">
          <Typography paragraph>
            PolyCal is intended for adults. You must be 18 or older (or the age of majority where
            you live, if higher) to hold an account. The service is designed around adult
            relationship structures and includes references to sleeping arrangements and partner
            relationships, so it carries a mature (17+) content rating in app distribution
            contexts.
          </Typography>
          <Typography paragraph>
            Accounts are created by your group administrator; there is no public self-service
            signup. You are responsible for the accuracy of the information on your profile.
          </Typography>
        </Section>

        <Section title="2. Your account">
          <Typography paragraph>
            You are responsible for keeping your password and devices secure and for all activity
            that happens under your account. Choose a strong password, do not share credentials,
            and sign out on shared devices. Tell your administrator immediately if you believe
            your account has been accessed by someone else.
          </Typography>
          <Typography paragraph>
            Administrators can create, pause, and remove accounts, and can act on group settings.
            Administrator impersonation, where used, is recorded in the activity log and cannot
            reach your connected Google Calendar.
          </Typography>
        </Section>

        <Section title="3. Acceptable use">
          <Typography paragraph>
            PolyCal is a shared space for a private group. When you use it, you agree not to:
          </Typography>
          <Box component="ul" sx={{ mt: 0, mb: 2, pl: 2.5 }}>
            <li>Post content that is unlawful, harassing, threatening, hateful, or defamatory</li>
            <li>Upload sexually explicit imagery, or images of anyone who has not consented</li>
            <li>
              Republish another member&apos;s schedule, relationship details, address, or photos
              outside the group without their consent
            </li>
            <li>Impersonate another person or create profiles for people who have not agreed</li>
            <li>
              Attempt to bypass access controls, scrape data, probe for vulnerabilities, or
              disrupt the service
            </li>
            <li>Upload malware or use the service to send unsolicited messages</li>
          </Box>
          <Typography paragraph>
            Content in PolyCal is visible to other members of your group under the product&apos;s
            visibility rules. Treat everything you enter as visible to your group.
          </Typography>
        </Section>

        <Section title="4. Content you provide">
          <Typography paragraph>
            You keep ownership of the content you submit — proposals, comments, feed posts,
            images, places, and profile details. You grant the operator of your deployment
            permission to store, process, and display that content as needed to run the service
            for your group. You are responsible for having the rights to anything you upload.
          </Typography>
        </Section>

        <Section title="5. Consent-based features">
          <Typography paragraph>
            Sleeping partnerships and residency at a place are proposed and then accepted by the
            other party. Do not use proxy (passive) profiles to represent someone who has not
            agreed to be scheduled in the group. Scheduling features are coordination tools, not
            a substitute for consent conversations between people.
          </Typography>
        </Section>

        <Section title="6. Optional integrations">
          <Typography paragraph>
            Google Calendar sync, iCal delivery, email notifications, and browser push are
            optional and are enabled per account. When you connect them, you also agree to the
            terms of those providers. Sync writes PolyCal events to the calendar you select;
            events already written remain in your calendar until you delete them there.
          </Typography>
        </Section>

        <Section id="deletion" title="7. Deleting your account">
          <Typography paragraph>
            You can delete your own account at any time from Profile &amp; Settings. Deleting is
            permanent and cannot be undone. Your profile fields, avatar, bio, notification and
            feed preferences, notification email, push subscriptions, and calendar connection are
            erased; your name is replaced with &quot;Former User&quot;; your open proposals are
            archived; and your places and partnership links are removed.
          </Typography>
          <Typography paragraph>
            Because PolyCal is a shared group tool, some records remain so the group&apos;s
            history stays intelligible: past feed posts and comments, resolved schedule history,
            and the operational activity log keep an anonymized reference. You can download a
            copy of your data before you delete. See the{" "}
            <MuiLink component={NextLink} href="/privacy#retention" underline="hover">
              Privacy Policy
            </MuiLink>{" "}
            for full retention detail.
          </Typography>
        </Section>

        <Section title="8. Suspension and termination">
          <Typography paragraph>
            Your administrator may pause or remove an account that violates these terms or at the
            request of the group. Deployment operators may suspend the service for maintenance,
            security, or legal reasons.
          </Typography>
        </Section>

        <Section title="9. Availability and disclaimers">
          <Typography paragraph>
            PolyCal is provided &quot;as is&quot; and &quot;as available&quot;, without warranties
            of any kind, express or implied, including merchantability, fitness for a particular
            purpose, and non-infringement. We do not warrant that the service will be
            uninterrupted, error-free, or that notifications, reminders, or calendar sync will
            always be delivered on time. Do not rely on PolyCal as the sole record of a
            commitment that matters.
          </Typography>
        </Section>

        <Section title="10. Limitation of liability">
          <Typography paragraph>
            To the maximum extent permitted by law, the operator of your deployment is not liable
            for indirect, incidental, special, consequential, or exemplary damages, or for lost
            data, missed events, or relationship harm arising from use of the service. Nothing in
            these terms limits liability that cannot be limited by law.
          </Typography>
        </Section>

        <Section title="11. Changes to these terms">
          <Typography paragraph>
            We may update these terms as the product changes. The effective date above will be
            revised when material changes are published at this URL. Continuing to use the
            service after a change means you accept the updated terms.
          </Typography>
        </Section>

        <Section title="12. Contact">
          <Typography paragraph>
            For questions about these terms, contact your PolyCal group administrator, or the
            contact channels published for your deployment.
          </Typography>
        </Section>

        <Typography sx={{ mt: 4 }}>
          <MuiLink component={NextLink} href="/privacy" underline="hover">
            Privacy Policy
          </MuiLink>
          {" · "}
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
