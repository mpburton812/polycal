import { Typography } from "@mui/material";
import { redirect } from "next/navigation";

import { listProposalBoardAction, listProposalPlaceOptionsAction } from "@/actions/proposals";
import { listPeopleAction } from "@/actions/users";
import { ProposalsClient } from "@/components/proposals/ProposalsClient";
import { auth } from "@/lib/auth";

export default async function ProposalsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const [board, people, places] = await Promise.all([
    listProposalBoardAction(),
    listPeopleAction(),
    listProposalPlaceOptionsAction(),
  ]);

  return (
    <>
      <Typography variant="h5" component="h1" gutterBottom>
        Proposals
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Draft, submit, and track proposals across your network. Voting and scheduling
        details expand in upcoming Phase 4 milestones.
      </Typography>
      <ProposalsClient
        board={board}
        people={people}
        places={places}
        currentUserId={session.user.id}
      />
    </>
  );
}
