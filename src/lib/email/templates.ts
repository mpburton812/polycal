/**
 * Thin HTML/text email bodies for Resend (PC-160). Absolute URLs only.
 */

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Notification-email verification message.
 */
export function buildVerifyEmailContent(verificationUrl: string): {
  subject: string;
  html: string;
  text: string;
} {
  const url = escapeHtml(verificationUrl);
  return {
    subject: "Verify your PolyCal notification email",
    html: `<p>Click to verify your PolyCal notification email:</p><p><a href="${url}">${url}</a></p><p>This link expires in 24 hours.</p>`,
    text: `Verify your PolyCal notification email:\n${verificationUrl}\n\nThis link expires in 24 hours.`,
  };
}

/**
 * Login credentials for a newly provisioned or reset account.
 */
export function buildCredentialsEmailContent(options: {
  username: string;
  password: string;
  loginUrl: string;
  verifyUrl?: string;
}): { subject: string; html: string; text: string } {
  const username = escapeHtml(options.username);
  const password = escapeHtml(options.password);
  const loginUrl = escapeHtml(options.loginUrl);
  const verifyBlock = options.verifyUrl
    ? `<p>Also verify your notification email:</p><p><a href="${escapeHtml(options.verifyUrl)}">${escapeHtml(options.verifyUrl)}</a></p>`
    : "";
  const verifyText = options.verifyUrl
    ? `\n\nVerify notification email: ${options.verifyUrl}`
    : "";

  return {
    subject: "Your PolyCal login",
    html: `<p>Welcome to PolyCal.</p><p>Sign in: <a href="${loginUrl}">${loginUrl}</a></p><p>Username: <strong>${username}</strong></p><p>Temporary password: <strong>${password}</strong></p><p>On first login you will be asked to change your password.</p>${verifyBlock}`,
    text: [
      "Welcome to PolyCal!",
      "",
      `Sign in: ${options.loginUrl}`,
      `Username: ${options.username}`,
      `Temporary password: ${options.password}`,
      "",
      "On first login you will be asked to change your password.",
      verifyText,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

/**
 * Self-service password reset link.
 */
export function buildPasswordResetEmailContent(resetUrl: string): {
  subject: string;
  html: string;
  text: string;
} {
  const url = escapeHtml(resetUrl);
  return {
    subject: "Reset your PolyCal password",
    html: `<p>Reset your PolyCal password:</p><p><a href="${url}">${url}</a></p><p>This link expires in 1 hour. If you did not request a reset, you can ignore this email.</p>`,
    text: `Reset your PolyCal password:\n${resetUrl}\n\nThis link expires in 1 hour. If you did not request a reset, you can ignore this email.`,
  };
}

/**
 * Event / activity notification email body with optional deep link.
 */
export function buildNotificationEmailContent(options: {
  title: string;
  message: string;
  detail?: string;
  url?: string;
}): { subject: string; html: string; text: string } {
  const title = escapeHtml(options.title);
  const message = escapeHtml(options.message);
  const detail = options.detail ? `<p>${escapeHtml(options.detail)}</p>` : "";
  const link =
    options.url != null
      ? `<p><a href="${escapeHtml(options.url)}">Open in PolyCal</a></p>`
      : "";
  const textParts = [options.message];
  if (options.detail) textParts.push(options.detail);
  if (options.url) textParts.push(options.url);
  return {
    subject: `PolyCal: ${options.title}`,
    html: `<p><strong>${title}</strong></p><p>${message}</p>${detail}${link}`,
    text: textParts.join("\n"),
  };
}
