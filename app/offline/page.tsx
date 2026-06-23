import { Typography } from "@mui/material";

export default function OfflinePage() {
  return (
    <main style={{ padding: 24, fontFamily: "Roboto, sans-serif" }}>
      <Typography variant="h5" component="h1" gutterBottom>
        You are offline
      </Typography>
      <Typography>
        PolyCal needs a network connection for scheduling data. Reconnect and
        refresh to continue.
      </Typography>
    </main>
  );
}
