process.stdout.write(
  JSON.stringify({
    url: process.env.TURSO_DATABASE_URL || "",
    env: process.env.NEXT_PUBLIC_APP_ENV || "",
    tokenLen: (process.env.TURSO_AUTH_TOKEN || "").length,
  }),
);
