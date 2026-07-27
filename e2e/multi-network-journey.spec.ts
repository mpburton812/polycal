import { expect, test } from "./helpers/test";

import { login, logout } from "./helpers/auth";
import { e2eApiPost } from "./helpers/e2e-api";

/**
 * Multi-network tenancy journeys (PC-357): create, provision, migrate import,
 * scoped delete vs platform ban (J1–J5).
 */
test.describe("Multi-network journey", () => {
  test("create network, migrate with import, scoped remove, platform ban", async ({
    page,
    request,
  }) => {
    test.setTimeout(300_000);
    const tag = Date.now();

    // J1 — create a second network (API fixture mirrors wizard commit)
    const created = await e2eApiPost<{ ok: boolean; networkId: string }>(
      request,
      "/api/e2e/networks",
      {
        op: "create_network",
        name: `E2E Net B ${tag}`,
        adminUserId: "sw-luke",
      },
    );
    expect(created.ok).toBe(true);
    const networkB = created.networkId!;

    // Resolve original network A via luke membership list through API create_user in A
    // Seed backfill already put everyone in network A — fetch via membership for a new user.
    const migrator = await e2eApiPost<{ ok: boolean; userId: string }>(
      request,
      "/api/e2e/networks",
      {
        op: "create_user",
        username: `migrator${tag}`,
        displayName: `Migrator ${tag}`,
        networkId: networkB, // temporarily; we'll also add to A below
        password: "ChangeMe123!",
        role: "user",
      },
    );
    // Put migrator in network A (first network): create place data on A by using luke's network.
    // Discover network A id by creating a throwaway check — use luke's membership via seed.
    // For seed, all users start on one network; get it by creating passive owned by migrator on B first.

    // Re-create migrator properly: add to both networks. First find network A from luke.
    // Use create_network already made B; A is the backfilled one. Query via membership_status after
    // ensuring migrator is on A — create_user only added to B. Add to A by finding A's id:
    // Seed locations belong to A. We'll create migrator on A via a second create_user if needed.

    // Simpler path: create migratorUser on network A using luke's known seed network.
    // We don't have A id yet — create via add after listing. Use create_user with networkB then
    // create_network already returned B. For A: create another network? No —
    // Call create_user for networkA by first creating a known network named from seed.

    // Bootstrap: create "network A handle" by creating user attached to B, then create
    // source network data under a dedicated source network that migrator owns.
    const sourceNet = await e2eApiPost<{ ok: boolean; networkId: string }>(
      request,
      "/api/e2e/networks",
      {
        op: "create_network",
        name: `E2E Net A ${tag}`,
        adminUserId: "sw-luke",
      },
    );
    const networkA = sourceNet.networkId!;

    const owner = await e2eApiPost<{ ok: boolean; userId: string }>(
      request,
      "/api/e2e/networks",
      {
        op: "create_user",
        username: `owner${tag}`,
        displayName: `Owner ${tag}`,
        networkId: networkA,
        password: "ChangeMe123!",
        role: "user",
      },
    );
    expect(owner.ok).toBe(true);
    const ownerId = owner.userId!;

    const passive = await e2eApiPost<{ ok: boolean; userId: string }>(
      request,
      "/api/e2e/networks",
      {
        op: "create_user",
        username: `passive${tag}`,
        displayName: `Passive ${tag}`,
        networkId: networkA,
        role: "passive",
        ownedByUserId: ownerId,
      },
    );
    expect(passive.ok).toBe(true);
    const passiveId = passive.userId!;

    const seeded = await e2eApiPost<{ ok: boolean }>(request, "/api/e2e/networks", {
      op: "seed_residence_and_sleeping",
      networkId: networkA,
      ownerId,
      passiveId,
      placeName: `Place ${tag}`,
    });
    expect(seeded.ok).toBe(true);

    // J3 — migrate owner into network B with import
    const joined = await e2eApiPost<{ ok: boolean }>(request, "/api/e2e/networks", {
      op: "join_with_import",
      userId: ownerId,
      sourceNetworkId: networkA,
      destNetworkId: networkB,
    });
    expect(joined.ok).toBe(true);

    const imported = await e2eApiPost<{
      ok: boolean;
      locationCount: number;
      partnershipCount: number;
    }>(request, "/api/e2e/networks", {
      op: "count_imported",
      networkId: networkB,
      ownerId,
    });
    expect(imported.ok).toBe(true);
    expect(imported.locationCount).toBeGreaterThanOrEqual(1);
    expect(imported.partnershipCount).toBeGreaterThanOrEqual(1);

    // J2 — provision new user only in network B
    const newbie = await e2eApiPost<{ ok: boolean; userId: string }>(
      request,
      "/api/e2e/networks",
      {
        op: "create_user",
        username: `newbie${tag}`,
        displayName: `Newbie ${tag}`,
        networkId: networkB,
        password: "ChangeMe123!",
        role: "user",
      },
    );
    expect(newbie.ok).toBe(true);

    await login(page, `newbie${tag}`, "ChangeMe123!");
    await expect(page).toHaveURL(/\/feed/);
    await logout(page);

    // J4 — third user in A+B; scoped remove from A keeps B
    const third = await e2eApiPost<{ ok: boolean; userId: string }>(
      request,
      "/api/e2e/networks",
      {
        op: "create_user",
        username: `third${tag}`,
        displayName: `Third ${tag}`,
        networkId: networkA,
        password: "ChangeMe123!",
        role: "user",
      },
    );
    expect(third.ok).toBe(true);
    await e2eApiPost(request, "/api/e2e/networks", {
      op: "add_member",
      networkId: networkB,
      userId: third.userId,
      role: "user",
    });

    const scoped = await e2eApiPost<{ ok: boolean }>(request, "/api/e2e/networks", {
      op: "scoped_remove",
      userId: third.userId,
      networkId: networkA,
    });
    expect(scoped.ok).toBe(true);

    const statusA = await e2eApiPost<{ ok: boolean; status: string | null }>(
      request,
      "/api/e2e/networks",
      { op: "membership_status", userId: third.userId, networkId: networkA },
    );
    const statusB = await e2eApiPost<{ ok: boolean; status: string | null }>(
      request,
      "/api/e2e/networks",
      { op: "membership_status", userId: third.userId, networkId: networkB },
    );
    expect(statusA.status).toBe("removed");
    expect(statusB.status).toBe("active");

    // J5 — fourth user banned from all networks
    const fourth = await e2eApiPost<{ ok: boolean; userId: string }>(
      request,
      "/api/e2e/networks",
      {
        op: "create_user",
        username: `fourth${tag}`,
        displayName: `Fourth ${tag}`,
        networkId: networkA,
        password: "ChangeMe123!",
        role: "user",
      },
    );
    await e2eApiPost(request, "/api/e2e/networks", {
      op: "add_member",
      networkId: networkB,
      userId: fourth.userId,
      role: "user",
    });
    const banned = await e2eApiPost<{ ok: boolean }>(request, "/api/e2e/networks", {
      op: "platform_ban",
      userId: fourth.userId,
    });
    expect(banned.ok).toBe(true);

    const banA = await e2eApiPost<{ ok: boolean; status: string | null }>(
      request,
      "/api/e2e/networks",
      { op: "membership_status", userId: fourth.userId, networkId: networkA },
    );
    const banB = await e2eApiPost<{ ok: boolean; status: string | null }>(
      request,
      "/api/e2e/networks",
      { op: "membership_status", userId: fourth.userId, networkId: networkB },
    );
    expect(banA.status).toBe("removed");
    expect(banB.status).toBe("removed");

    // UI smoke: create-network entry exists on login
    await page.goto("/login");
    await expect(page.getByRole("link", { name: /Create new network/i })).toBeVisible();
  });
});
