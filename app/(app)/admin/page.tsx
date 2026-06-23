import { Stack, Typography } from "@mui/material";
import { redirect } from "next/navigation";

import { AdminTestDataPanel } from "@/components/admin/AdminTestDataPanel";
import { auth } from "@/lib/auth";
import { isNonProductionEnvironment } from "@/lib/env";

export default async function AdminPage() {
  const session = await auth();
  if (session?.user.role !== "admin") {
    redirect("/schedule");
  }

  return (
    <>
      <Typography variant="h5" component="h1" gutterBottom>
        Admin
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Poly group settings and user management arrive in Phase 8. Use People
        &amp; Places to add users and manage partnerships. Test data controls
        are available below.
      </Typography>
      <Stack spacing={3}>
        {isNonProductionEnvironment() && <AdminTestDataPanel />}
      </Stack>
    </>
  );
}
