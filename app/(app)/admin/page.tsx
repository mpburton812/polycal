import { Typography } from "@mui/material";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

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
      <Typography color="text.secondary">
        Poly group settings, user management, and system logs arrive in Phase 8.
      </Typography>
    </>
  );
}
