import { Suspense } from "react";
import { Typography } from "@mui/material";
import { redirect } from "next/navigation";

import { listProposalBoardAction, listProposalPlaceOptionsAction } from "@/actions/proposals";
import { listPeopleAction } from "@/actions/users";
import { ProposalsClient } from "@/components/proposals/ProposalsClient";
import { auth } from "@/lib/auth";
import { brutalPageTitleSx } from "@/theme/brutalUi";
import { GARDEN_TOKENS } from "@/theme/tokens";

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
      <Typography variant="h5" component="h1" gutterBottom sx={brutalPageTitleSx}>
        Proposals
      </Typography>
      <Typography sx={{ mb: 3, color: GARDEN_TOKENS.inkMuted }}>
        Draft, submit, vote, and resolve proposals. Click any card for details and actions.
      </Typography>
      <Suspense fallback={null}>
        <ProposalsClient
          board={board}
          people={people}
          places={places}
          currentUserId={session.user.id}
        />
      </Suspense>
    </>
  );
}
