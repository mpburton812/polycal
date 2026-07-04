import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { castProposalVoteAction } from "@/actions/proposals";

const acceptSchema = z.object({
  proposalId: z.string().min(1),
});

/**
 * Accepts (accept-votes) a proposal from a Web Push notification action button.
 * Service workers cannot invoke server actions directly, so the SW POSTs here
 * with the recipient's cookie session; the vote logic re-validates permissions.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { ok: false, message: "Sign in required." },
      { status: 401 },
    );
  }

  const json = await request.json().catch(() => null);
  const parsed = acceptSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "Invalid request." },
      { status: 400 },
    );
  }

  const result = await castProposalVoteAction({
    proposalId: parsed.data.proposalId,
    vote: "accept",
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}
