"use client";

import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useSession } from "next-auth/react";

import {
  completeNetworkSetupAction,
  listMyNetworksAction,
  validateNetworkSetupTokenAction,
} from "@/actions/networks";
import { brutalPaperSx } from "@/theme/brutalUi";
import { fontFamilies } from "@/theme/fonts";
import { GARDEN_TOKENS } from "@/theme/tokens";

/**
 * Magic-link redeem + network setup wizard (PC-360 / PC-361).
 */
function SetupNetworkWizard() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const router = useRouter();
  const { update } = useSession();
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
      const networks = await listMyNetworksAction();
      setSourceNetworks(networks);
      if (networks[0]) setImportFromNetworkId(networks[0].networkId);
    })();
  }, [token]);

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
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    if (result.networkId) {
      await update({
        user: {
          activeNetworkId: result.networkId,
          activeNetworkRole: "network_admin",
        },
      });
    }
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
            Creating as {email}
          </Typography>
        )}
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
          After setup, invite more people from Admin → User management. You can
          add up to five invites here later; for now create the network first.
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
          disabled={busy || !networkName.trim()}
          onClick={() => void onComplete()}
          sx={{
            mt: 2,
            bgcolor: GARDEN_TOKENS.sage,
            color: GARDEN_TOKENS.surface,
          }}
        >
          {busy ? "Creating…" : "Create network"}
        </Button>
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
