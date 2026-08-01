/**
 * Outbound email via Resend when configured; otherwise logs only (PC-53).
 * Supports optional base64 attachments for ICS delivery (PC-340).
 */

export interface SendEmailAttachment {
  /** Filename shown to the recipient. */
  filename: string;
  /** Base64-encoded file content (Resend API). */
  content: string;
  contentType?: string;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: SendEmailAttachment[];
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

  const body: Record<string, unknown> = {
    from,
    to: [input.to],
    subject: input.subject,
    html: input.html,
    text: input.text ?? input.html.replace(/<[^>]+>/g, " "),
  };

  if (input.attachments?.length) {
    body.attachments = input.attachments.map((file) => ({
      filename: file.filename,
      content: file.content,
      content_type: file.contentType,
    }));
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(`Resend API ${response.status}: ${responseBody}`);
  }

  return { sent: true, provider: "resend" };
}
