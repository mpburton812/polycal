/**
 * Outbound email via Resend when configured; otherwise logs only (PC-53).
 */

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendEmailResult {
  sent: boolean;
  provider: "resend" | "log-only";
  detail?: string;
}

/**
 * Sends email through Resend when RESEND_API_KEY and EMAIL_FROM are set.
 * Falls back to console/activity logging when not configured (non-production safe).
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();

  if (!apiKey || !from) {
    return {
      sent: false,
      provider: "log-only",
      detail: "RESEND_API_KEY or EMAIL_FROM not configured",
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text ?? input.html.replace(/<[^>]+>/g, " "),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend API ${response.status}: ${body}`);
  }

  return { sent: true, provider: "resend" };
}
