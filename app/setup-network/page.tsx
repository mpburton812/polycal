"use client";

import {
  Box,
  Button,
  Checkbox,
  FormControl,
  FormControlLabel,
  FormLabel,
  Paper,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from "@mui/material";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { Suspense, useEffect, useState } from "react";

import { checkUsernameAvailableAction } from "@/actions/users";
import {
  completeNetworkSetupAction,
  listMyNetworksAction,
  validateNetworkSetupTokenAction,
} from "@/actions/networks";
import { brutalPaperSx } from "@/theme/brutalUi";
import { fontFamilies } from "@/theme/fonts";
import { GARDEN_TOKENS } from "@/theme/tokens";

type AdminAccountMode = "existing" | "new";

/**
 * Magic-link redeem + network setup wizard (PC-360 / PC-361 / PC-363).
 */
function SetupNetworkWizard() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const router = useRouter();
  const { data: session, status, update } = useSession();
  const signedIn = status === "authenticated" && Boolean(session?.user?.id);

  const [email, setEmail] = useState<string | null>(null);
  const [signedInUser, setSignedInUser] = useState<{
    username: string;
    displayName: string;
    emailMatches: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accountMode, setAccountMode] = useState<AdminAccountMode>("existing");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [usernameHint, setUsernameHint] = useState<string | null>(null);
  const [networkName, setNetworkName] = useState("");
  const [allowProvisioning, setAllowProvisioning] = useState(false);
  const [importResidences, setImportResidences] = useState(false);
  const [importPassiveSleeping, setImportPassiveSleeping] = useState(false);
  const [sourceNetworks, setSourceNetworks] = useState<
    { networkId: string; name: string }[]
  >([]);
  const [importFromNetworkId, setImportFromNetworkId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const result = await validateNetworkSetupTokenAction(token);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setEmail(result.email ?? null);
      setSignedInUser(result.signedInUser ?? null);
      if (result.signedInUser && !result.signedInUser.emailMatches) {
        setError(
          "This setup link was sent to a different email than your signed-in account. Sign out and use the matching account, or request a new link.",
        );
      }
      const networks = await listMyNetworksAction();
      setSourceNetworks(networks);
      if (networks[0]) setImportFromNetworkId(networks[0].networkId);
    })();
  }, [token]);

  useEffect(() => {
    if (accountMode !== "new" || username.trim().length < 2) {
      setUsernameHint(null);
      return;
    }
    const handle = window.setTimeout(() => {
      void checkUsernameAvailableAction(username).then((result) => {
        setUsernameHint(result.available ? "Username available" : result.message);
      });
    }, 300);
    return () => window.clearTimeout(handle);
  }, [accountMode, username]);

  async function onComplete() {
    setBusy(true);
    setError(null);
    const result = await completeNetworkSetupAction({
      token,
      networkName,
      allowUserProvisioning: allowProvisioning,
      importFromNetworkId: importFromNetworkId || undefined,
      importResidences,
      importPassiveSleeping,
      adminMode: signedIn ? "session" : accountMode,
      username: signedIn ? undefined : username,
      password: signedIn ? undefined : password,
      displayName: signedIn ? undefined : displayName,
      confirmPassword: signedIn ? undefined : confirmPassword,
    });
    if (!result.ok) {
      setBusy(false);
      setError(result.message);
      return;
    }

    if (result.signInUsername && result.signInPassword) {
      const signInResult = await signIn("credentials", {
        username: result.signInUsername,
        password: result.signInPassword,
        redirect: false,
      });
      if (signInResult?.error) {
        setBusy(false);
        setError("Network created, but sign-in failed. Log in and switch to your new network.");
        return;
      }
    }

    if (result.networkId) {
      await update({
        user: {
          activeNetworkId: result.networkId,
          activeNetworkRole: "sponsor",
        },
      });
    }
    setBusy(false);
    router.push("/feed");
    router.refresh();
  }

  if (error && !email) {
    return (
      <Box sx={{ p: 3, maxWidth: 480, mx: "auto" }}>
        <Typography color="error">{error}</Typography>
        <Button component={Link} href="/create-network" sx={{ mt: 2 }}>
          Request a new link
        </Button>
      </Box>
    );
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
      <Paper sx={{ ...brutalPaperSx, maxWidth: 520, width: "100%", p: 3 }}>
        <Typography
          variant="h5"
          sx={{ fontFamily: fontFamilies.display, mb: 1 }}
        >
          Set up your network
        </Typography>
        {email && (
          <Typography variant="body2" sx={{ mb: 2, color: GARDEN_TOKENS.inkMuted }}>
            Setup link for {email}
          </Typography>
        )}

        {signedIn ? (
          signedInUser && !signedInUser.emailMatches ? (
            <Box sx={{ mb: 2 }}>
              <Typography color="error" variant="body2" sx={{ mb: 1 }}>
                Signed in as <strong>{signedInUser.displayName}</strong> (@
                {signedInUser.username}), but this link is for <strong>{email}</strong>.
              </Typography>
              <Button
                variant="outlined"
                fullWidth
                onClick={() => void signOut({ callbackUrl: `/setup-network?token=${encodeURIComponent(token)}` })}
              >
                Sign out and continue setup
              </Button>
            </Box>
          ) : (
            <>
              <Typography variant="subtitle2" sx={{ mt: 1 }}>
                Step 1 — Network admin
              </Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>
                You&apos;ll be the first network admin as{" "}
                <strong>{session?.user?.displayName ?? session?.user?.name}</strong>
                {email ? ` (email must match ${email})` : ""}.
              </Typography>
            </>
          )
        ) : (
          <>
            <Typography variant="subtitle2" sx={{ mt: 1 }}>
              Step 1 — First network admin
            </Typography>
            <Typography variant="body2" sx={{ color: GARDEN_TOKENS.inkMuted, mb: 1 }}>
              Use an account tied to {email}. That person becomes the network admin.
            </Typography>
            <FormControl component="fieldset" sx={{ mb: 1 }}>
              <FormLabel component="legend">Account</FormLabel>
              <RadioGroup
                value={accountMode}
                onChange={(e) => setAccountMode(e.target.value as AdminAccountMode)}
              >
                <FormControlLabel
                  value="existing"
                  control={<Radio />}
                  label="I already have an account"
                />
                <FormControlLabel
                  value="new"
                  control={<Radio />}
                  label="Create a new account"
                />
              </RadioGroup>
            </FormControl>
            <TextField
              label="Username"
              required
              fullWidth
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              margin="normal"
              autoComplete="username"
            />
            {accountMode === "new" && (
              <TextField
                label="Display name"
                required
                fullWidth
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                margin="normal"
                autoComplete="name"
              />
            )}
            <TextField
              label="Password"
              type="password"
              required
              fullWidth
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              margin="normal"
              autoComplete={accountMode === "new" ? "new-password" : "current-password"}
            />
            {accountMode === "new" && (
              <TextField
                label="Confirm password"
                type="password"
                required
                fullWidth
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                margin="normal"
                autoComplete="new-password"
              />
            )}
            {usernameHint && (
              <Typography
                variant="caption"
                sx={{
                  display: "block",
                  color: usernameHint === "Username available"
                    ? GARDEN_TOKENS.sage
                    : "error.main",
                }}
              >
                {usernameHint}
              </Typography>
            )}
          </>
        )}

        {(!signedIn || (signedInUser?.emailMatches ?? true)) && (
          <>
        <Typography variant="subtitle2" sx={{ mt: signedIn ? 0 : 2 }}>
          Step 2 — Network details
        </Typography>
        <TextField
          label="Network name"
          required
          fullWidth
          value={networkName}
          onChange={(e) => setNetworkName(e.target.value)}
          margin="normal"
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={allowProvisioning}
              onChange={(e) => setAllowProvisioning(e.target.checked)}
            />
          }
          label="Allow members to provision new users"
        />
        <Typography variant="subtitle2" sx={{ mt: 2 }}>
          User management
        </Typography>
        <Typography variant="body2" sx={{ color: GARDEN_TOKENS.inkMuted, mb: 1 }}>
          After setup, invite more people from Admin → User management.
        </Typography>
        {sourceNetworks.length > 0 && (
          <>
            <Typography variant="subtitle2" sx={{ mt: 2 }}>
              Bring from another network
            </Typography>
            <TextField
              select
              SelectProps={{ native: true }}
              fullWidth
              label="Source network"
              value={importFromNetworkId}
              onChange={(e) => setImportFromNetworkId(e.target.value)}
              margin="normal"
            >
              {sourceNetworks.map((n) => (
                <option key={n.networkId} value={n.networkId}>
                  {n.name}
                </option>
              ))}
            </TextField>
            <FormControlLabel
              control={
                <Checkbox
                  checked={importResidences}
                  onChange={(e) => setImportResidences(e.target.checked)}
                />
              }
              label="Copy my residences (and owned proxies at those places)"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={importPassiveSleeping}
                  onChange={(e) => setImportPassiveSleeping(e.target.checked)}
                />
              }
              label="Copy sleeping status with my owned proxies"
            />
          </>
        )}
        {error && (
          <Typography color="error" variant="body2" sx={{ mt: 1 }}>
            {error}
          </Typography>
        )}
        <Button
          variant="contained"
          fullWidth
          disabled={
            busy ||
            !networkName.trim() ||
            (signedIn && signedInUser && !signedInUser.emailMatches) ||
            (!signedIn && (!username.trim() || !password.trim()))
          }
          onClick={() => void onComplete()}
          sx={{
            mt: 2,
            bgcolor: GARDEN_TOKENS.sage,
            color: GARDEN_TOKENS.surface,
          }}
        >
          {busy ? "Creating…" : "Create network"}
        </Button>
          </>
        )}
      </Paper>
    </Box>
  );
}

export default function SetupNetworkPage() {
  return (
    <Suspense fallback={<Typography sx={{ p: 3 }}>Loading…</Typography>}>
      <SetupNetworkWizard />
    </Suspense>
  );
}
