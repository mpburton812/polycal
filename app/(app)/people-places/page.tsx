import { Typography } from "@mui/material";
import dynamic from "next/dynamic";
import { redirect } from "next/navigation";

import { listPlacesAction } from "@/actions/places";
import { listSleepingPartnershipMapEdgesAction } from "@/actions/partnerships";
import { getPlacesMapVisibilityAction } from "@/actions/poly-group";
import { listPeopleAction, getProvisioningPolicyAction } from "@/actions/users";
import { auth } from "@/lib/auth";
import { userHasAdminAccess } from "@/lib/admin-access";
import { brutalPageTitleSx } from "@/theme/brutalUi";

function PeoplePlacesFallback() {
  return (
    <p style={{ margin: 0, padding: "24px 0", textAlign: "center", color: "#666" }}>
      Loading people &amp; places…
    </p>
  );
}

/** Heavy client tree code-split so the page shell paints first (PC-282). */
const PeoplePlacesClient = dynamic(
  () =>
    import("@/components/people-places/PeoplePlacesClient").then((mod) => ({
      default: mod.PeoplePlacesClient,
    })),
  { ssr: true, loading: () => <PeoplePlacesFallback /> },
);

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
      <Typography variant="h5" component="h1" gutterBottom sx={brutalPageTitleSx}>
        People &amp; Places
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
