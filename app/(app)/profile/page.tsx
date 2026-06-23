import { Button, Typography } from "@mui/material";

import { auth, signOut } from "@/lib/auth";

export default async function ProfilePage() {
  const session = await auth();

  async function logoutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <>
      <Typography variant="h5" component="h1" gutterBottom>
        Profile
      </Typography>
      <Typography gutterBottom>
        Signed in as <strong>{session?.user.displayName}</strong> (
        {session?.user.role})
      </Typography>
      {session?.user.mustChangePassword && (
        <Typography color="warning.main" sx={{ mb: 2 }}>
          Password change required on first login (Phase 2).
        </Typography>
      )}
      <form action={logoutAction}>
        <Button type="submit" variant="outlined" color="primary">
          Log out
        </Button>
      </form>
    </>
  );
}
