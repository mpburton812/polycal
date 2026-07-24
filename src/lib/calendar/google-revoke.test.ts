import { describe, expect, it, vi } from "vitest";

import { revokeGoogleOAuthToken } from "@/lib/calendar/google-revoke";

describe("revokeGoogleOAuthToken", () => {
  it("posts the token to Google's revoke endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    await expect(revokeGoogleOAuthToken("refresh-abc")).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://oauth2.googleapis.com/revoke",
      expect.objectContaining({ method: "POST" }),
    );
    const body = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(body.get("token")).toBe("refresh-abc");
  });

  it("returns false for empty tokens without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(revokeGoogleOAuthToken("  ")).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
