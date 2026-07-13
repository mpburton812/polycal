"use client";

import { Box, CircularProgress, Typography } from "@mui/material";
import { useEffect, useState } from "react";

import { fontFamilies } from "@/theme/fonts";
import { GARDEN_TOKENS } from "@/theme/tokens";

/**
 * Detects Serwist/service-worker activation after a new deploy and shows a
 * blocking “Updating…” overlay before reloading (PC-202). Complements admin
 * force-reload; does not unregister caches.
 */
export function PwaUpdateGate() {
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    let refreshing = false;

    function onControllerChange() {
      if (refreshing) return;
      refreshing = true;
      setUpdating(true);
      // Brief paint so the user sees the cue before reload.
      window.setTimeout(() => {
        window.location.reload();
      }, 400);
    }

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    void navigator.serviceWorker.getRegistration().then((registration) => {
      if (!registration) return;

      const onUpdateFound = () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          // Installed while a controller exists ⇒ a new build is taking over.
          if (
            installing.state === "installed" &&
            navigator.serviceWorker.controller
          ) {
            setUpdating(true);
          }
        });
      };

      registration.addEventListener("updatefound", onUpdateFound);
      // Opportunistic check when the shell mounts (post-deploy return visits).
      void registration.update().catch(() => undefined);

      return () => {
        registration.removeEventListener("updatefound", onUpdateFound);
      };
    });

    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
    };
  }, []);

  if (!updating) return null;

  return (
    <Box
      role="alert"
      aria-live="assertive"
      sx={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        bgcolor: `${GARDEN_TOKENS.background}f2`,
        backdropFilter: "blur(4px)",
      }}
    >
      <Typography
        sx={{
          fontFamily: fontFamilies.display,
          fontWeight: 700,
          fontSize: "1.5rem",
          color: GARDEN_TOKENS.ink,
        }}
      >
        Updating PolyCal…
      </Typography>
      <CircularProgress size={36} sx={{ color: GARDEN_TOKENS.sage }} />
      <Typography
        variant="body2"
        sx={{ fontFamily: fontFamilies.label, color: GARDEN_TOKENS.inkMuted }}
      >
        A new version is ready. Refreshing…
      </Typography>
    </Box>
  );
}
