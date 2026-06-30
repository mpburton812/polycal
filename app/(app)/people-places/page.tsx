import { Typography } from "@mui/material";
import { redirect } from "next/navigation";

import { listPlacesAction } from "@/actions/places";
import { listSleepingPartnershipMapEdgesAction } from "@/actions/partnerships";
import { getPlacesMapVisibilityAction } from "@/actions/poly-group";
import { listPeopleAction, getProvisioningPolicyAction } from "@/actions/users";
import { PeoplePlacesClient } from "@/components/people-places/PeoplePlacesClient";
import { auth } from "@/lib/auth";
import { userHasAdminAccess } from "@/lib/admin-access";

export default async function PeoplePlacesPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const [people, places, policy, hasAdminAccess, placesMapVisibility, mapEdges] =
    await Promise.all([
    listPeopleAction(),
    listPlacesAction(),
    getProvisioningPolicyAction(),
    userHasAdminAccess(session.user.role),
    getPlacesMapVisibilityAction(),
    listSleepingPartnershipMapEdgesAction(),
  ]);

  return (
    <>
      <Typography variant="h5" component="h1" gutterBottom>
        People &amp; Places
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Manage network members, sleeping partnerships, and shared locations.
      </Typography>
      <PeoplePlacesClient
        people={people}
        places={places}
        currentUserId={session.user.id}
        canProvision={policy.canProvision}
        isAdmin={hasAdminAccess}
        placesMapVisibility={placesMapVisibility}
        mapEdges={mapEdges}
      />
    </>
  );
}
