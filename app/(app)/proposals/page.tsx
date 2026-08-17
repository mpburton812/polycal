import { Suspense } from "react";
import { Typography } from "@mui/material";
import { redirect } from "next/navigation";

import { listProposalBoardAction, listProposalPlaceOptionsAction } from "@/actions/proposals";
import { listPeopleAction } from "@/actions/users";
import { ProposalsClient } from "@/components/proposals/ProposalsClient";
import { auth } from "@/lib/auth";
import { userHasAdminAccess } from "@/lib/admin-access";
import { brutalPageTitleSx } from "@/theme/brutalUi";
import type { UserRole } from "@/types/user";

export default async function ProposalsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const isAdmin = await userHasAdminAccess(session.user.role as UserRole);

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
      <Suspense fallback={null}>
        <ProposalsClient
          board={board}
          people={people}
          places={places}
          currentUserId={session.user.id}
          isAdmin={isAdmin}
        />
      </Suspense>
    </>
  );
}
