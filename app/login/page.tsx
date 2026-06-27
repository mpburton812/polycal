import { Box, Button, Paper, TextField, Typography } from "@mui/material";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { auth, signIn } from "@/lib/auth";
import { getLiveUserStatus } from "@/lib/auth-session";
import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { users } from "@/lib/db/schema";
import { getNonProductionLoginHint } from "@/lib/seed/login-hint";

interface LoginPageProps {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}

/**
 * Credentials login — persistent session until logout or admin termination (spec §1).
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await auth();
  if (session?.user?.id) {
    const liveStatus = await getLiveUserStatus(session.user.id);
    if (liveStatus === "paused") {
      redirect("/paused");
    }
    redirect("/schedule");
  }

  const params = await searchParams;
  const loginHint = getNonProductionLoginHint();

  async function loginAction(formData: FormData) {
    "use server";
    const username = String(formData.get("username") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    let redirectTo = String(formData.get("callbackUrl") ?? "/schedule");

    await ensureDbReady();
    const db = getDb();
    const [row] = await db
      .select({ status: users.status })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);
    if (row?.status === "paused") {
      redirectTo = "/paused";
    }

    try {
      await signIn("credentials", {
        username,
        password,
        redirectTo,
      });
    } catch {
      redirect("/login?error=CredentialsSignin");
    }
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "background.default",
        p: 2,
      }}
    >
      <Paper sx={{ p: 4, width: "100%", maxWidth: 400 }} elevation={2}>
        <Typography variant="h5" component="h1" gutterBottom>
          PolyCal
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Sign in with your username and password.
        </Typography>
        {params.error && (
          <Typography color="error" variant="body2" sx={{ mb: 2 }}>
            Invalid username or password.
          </Typography>
        )}
        <Box component="form" action={loginAction}>
          <input
            type="hidden"
            name="callbackUrl"
            value={params.callbackUrl ?? "/schedule"}
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
            required
            autoComplete="current-password"
            margin="normal"
          />
          <Button type="submit" variant="contained" fullWidth sx={{ mt: 2 }}>
            Sign in
          </Button>
        </Box>
        {loginHint && (
          <Typography variant="caption" display="block" sx={{ mt: 2 }}>
            {loginHint}
          </Typography>
        )}
      </Paper>
    </Box>
  );
}
