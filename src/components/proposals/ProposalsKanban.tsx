import {
  Chip,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import { asc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { ensureDbReady } from "@/lib/db/ensure-ready";
import { proposals, proposalStates, users } from "@/lib/db/schema";

const STATE_LABELS: Record<(typeof proposalStates)[number], string> = {
  draft: "Drafts",
  proposed: "Proposed",
  resolved: "Resolved",
  archived: "Archived",
};

/**
 * Read-only Kanban columns for seeded demo proposals (PC-28).
 */
export async function ProposalsKanban() {
  await ensureDbReady();
  const db = getDb();

  const rows = await db
    .select({
      id: proposals.id,
      title: proposals.title,
      description: proposals.description,
      proposalType: proposals.proposalType,
      state: proposals.state,
      proposerName: users.displayName,
    })
    .from(proposals)
    .innerJoin(users, eq(proposals.proposerId, users.id))
    .orderBy(asc(proposals.title));

  const grouped = Object.fromEntries(
    proposalStates.map((state) => [state, rows.filter((row) => row.state === state)]),
  ) as Record<(typeof proposalStates)[number], typeof rows>;

  return (
    <Stack spacing={2}>
      {proposalStates.map((state) => (
        <Paper key={state} variant="outlined" sx={{ p: 2 }}>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <Typography variant="subtitle1" fontWeight={600}>
              {STATE_LABELS[state]}
            </Typography>
            <Chip size="small" label={grouped[state].length} />
          </Stack>
          {grouped[state].length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No proposals in this column.
            </Typography>
          ) : (
            <List dense disablePadding>
              {grouped[state].map((proposal) => (
                <ListItem key={proposal.id} disableGutters sx={{ alignItems: "flex-start" }}>
                  <ListItemText
                    primary={proposal.title}
                    secondary={
                      <>
                        {proposal.description}
                        <br />
                        {proposal.proposalType} · Proposer: {proposal.proposerName}
                      </>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Paper>
      ))}
    </Stack>
  );
}
