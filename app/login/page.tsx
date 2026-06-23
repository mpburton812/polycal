import { Box, Button, Paper, TextField, Typography } from "@mui/material";
import { redirect } from "next/navigation";

import { auth, signIn } from "@/lib/auth";
import { isNonProductionEnvironment } from "@/lib/env";

interface LoginPageProps {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}

/**
 * Credentials login — persistent session until logout or admin termination (spec §1).
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await auth();
  if (session?.user) {
    redirect("/schedule");
  }

  const params = await searchParams;

  async function loginAction(formData: FormData) {
    "use server";
    const username = String(formData.get("username") ?? "");
    const password = String(formData.get("password") ?? "");
    const callbackUrl = String(formData.get("callbackUrl") ?? "/schedule");
    await signIn("credentials", {
      username,
      password,
      redirectTo: callbackUrl,
    });
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
        {isNonProductionEnvironment() && (
          <Typography variant="caption" display="block" sx={{ mt: 2 }}>
            Non-production seed: luke / ChangeMe123!
          </Typography>
        )}
      </Paper>
    </Box>
  );
}
