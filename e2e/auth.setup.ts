import { test as setup } from "@playwright/test";
import path from "node:path";

import { E2E_PORT } from "./e2e-env";
import { login } from "./helpers/auth";
import { USERS } from "./helpers/constants";
import { resolveServerCount } from "./parallel";

const AUTH_DIR = path.join(__dirname, ".auth");

setup.setTimeout(180_000);

/**
 * Logs in luke on each worker origin so default specs reuse JWT cookies (PC-175).
 */
setup("authenticate luke per worker origin", async ({ browser }) => {
  const servers = resolveServerCount();

  for (let dbIndex = 0; dbIndex < servers; dbIndex += 1) {
    const port = E2E_PORT + dbIndex;
    const baseURL = `http://localhost:${port}`;
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await login(page, USERS.luke.username);
    await page.waitForURL(/\/(feed|schedule|profile|people-places|proposals|admin)/);
    await context.storageState({
      path: path.join(AUTH_DIR, `luke-w${dbIndex}.json`),
    });
    await context.close();
  }
});
