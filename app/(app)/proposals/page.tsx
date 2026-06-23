import { Typography } from "@mui/material";

import { ProposalsKanban } from "@/components/proposals/ProposalsKanban";

export default function ProposalsPage() {
  return (
    <>
      <Typography variant="h5" component="h1" gutterBottom>
        Proposals
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Demo Kanban seeded across all workflow columns. Voting and creation UI
        arrive in Phases 4–5.
      </Typography>
      <ProposalsKanban />
    </>
  );
}
