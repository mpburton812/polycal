import { Box, Button, Paper, TextField, Typography } from "@mui/material";
import Image from "next/image";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { requestEmailLoginAction } from "@/actions/email-login";
import { auth, signIn } from "@/lib/auth";
import { safeInternalCallbackPath } from "@/lib/auth/callback-url";
import { getLiveUserStatus } from "@/lib/auth-session";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { users } from "@/lib/db/schema";
import { getNonProductionLoginHint } from "@/lib/seed/login-hint";
import { fontFamilies } from "@/theme/fonts";
import { brutalPaperSx } from "@/theme/brutalUi";
import { GARDEN_TOKENS } from "@/theme/tokens";

interface LoginPageProps {
  searchParams: Promise<{ error?: string; callbackUrl?: string; reset?: string; emailed?: string }>;
}

/**
 * Credentials login — persistent session until logout or admin termination (spec §1).
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const callbackUrl = safeInternalCallbackPath(params.callbackUrl);

  const session = await auth();
  if (session?.user?.id) {
    const liveStatus = await getLiveUserStatus(session.user.id);
    if (liveStatus === "paused") {
      redirect("/paused");
    }
    if (liveStatus === "banned") {
      redirect("/banned");
    }
    redirect(callbackUrl);
  }

  const loginHint = getNonProductionLoginHint();

  async function loginAction(formData: FormData) {
    "use server";
    const username = String(formData.get("username") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    let redirectTo = safeInternalCallbackPath(String(formData.get("callbackUrl") ?? "/feed"));

    await ensureDbReady();
    const db = getDb();
    const [row] = await db
      .select({ status: users.status })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);
    if (row?.status === "paused") {
      redirectTo = "/paused";
    } else if (row?.status === "banned") {
      redirectTo = "/banned";
    }

    try {
      await signIn("credentials", {
        username,
        password,
        redirectTo,
      });
    } catch (error) {
      // Auth.js successful sign-in throws NEXT_REDIRECT; rethrow so the compose callback survives.
      if (
        typeof error === "object" &&
        error !== null &&
        "digest" in error &&
        String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT")
      ) {
        throw error;
      }
      const retry = new URLSearchParams();
      retry.set("error", "CredentialsSignin");
      retry.set("callbackUrl", redirectTo);
      redirect(`/login?${retry.toString()}`);
    }
  }

  async function emailLoginAction(formData: FormData) {
    "use server";
    const username = String(formData.get("username") ?? "").trim().toLowerCase();
    await requestEmailLoginAction(username);
    redirect("/login?emailed=1");
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: GARDEN_TOKENS.background,
        p: 2,
      }}
    >
      <Paper elevation={0} sx={{ ...brutalPaperSx, width: "100%", maxWidth: 400 }}>
        <Box sx={{ display: "flex", justifyContent: "center", mb: 2 }}>
          <Image
            src="/illustrations/empty-schedule-day.svg"
            alt=""
            width={96}
            height={80}
            priority
          />
        </Box>
        <Typography
          variant="h5"
          component="h1"
          gutterBottom
          sx={{ fontFamily: fontFamilies.display, fontWeight: 700, color: GARDEN_TOKENS.ink }}
        >
          PolyCal
        </Typography>
        <Typography variant="body2" sx={{ mb: 3, color: GARDEN_TOKENS.inkMuted }}>
          Coordinate your constellation — sign in with your username and password.
        </Typography>
        {params.error && (
          <Typography color="error" variant="body2" sx={{ mb: 2 }}>
            Invalid username or password.
          </Typography>
        )}
        {params.reset === "1" && (
          <Typography color="success.main" variant="body2" sx={{ mb: 2 }}>
            Password updated. Sign in with your new password.
          </Typography>
        )}
        {params.emailed === "1" && (
          <Typography color="success.main" variant="body2" sx={{ mb: 2 }}>
            If that account has a verified notification email, we sent a login link.
          </Typography>
        )}
        <Box component="form" action={loginAction}>
          <input
            type="hidden"
            name="callbackUrl"
            value={callbackUrl}
          />
          <TextField
            name="username"
            label="Username"
            fullWidth
            required
            autoComplete="username"
            margin="normal"
          />
          <TextField
            name="password"
            label="Password"
            type="password"
            fullWidth
            autoComplete="current-password"
            margin="normal"
          />
          <Button
            type="submit"
            variant="contained"
            fullWidth
            sx={{
              mt: 2,
              bgcolor: GARDEN_TOKENS.sage,
              color: GARDEN_TOKENS.surface,
              "&:hover": { bgcolor: "#557A5C" },
            }}
          >
            Sign in
          </Button>
          <Button
            type="submit"
            formAction={emailLoginAction}
            variant="outlined"
            fullWidth
            sx={{ mt: 1.5, color: GARDEN_TOKENS.ink }}
          >
            Email login
          </Button>
        </Box>
        <Button
          component={Link}
          href="/forgot-password"
          fullWidth
          sx={{ mt: 1.5, color: GARDEN_TOKENS.inkMuted }}
        >
          Forgot password?
        </Button>
        <Button
          component={Link}
          href="/create-network"
          fullWidth
          sx={{ mt: 1, color: GARDEN_TOKENS.ink }}
        >
          Create new network
        </Button>
        {loginHint && (
          <Typography variant="caption" display="block" sx={{ mt: 2, color: GARDEN_TOKENS.inkMuted }}>
            {loginHint}
          </Typography>
        )}
      </Paper>
    </Box>
  );
}
