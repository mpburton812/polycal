/**
 * Parses admin-provisioned login instructions from the Add person dialog.
 */
export function parseLoginInstructions(text: string): {
  username: string;
  temporaryPassword: string;
} {
  const usernameMatch = text.match(/^Username:\s*(.+)$/m);
  const passwordMatch = text.match(/^Temporary password:\s*(.+)$/m);
  if (!usernameMatch || !passwordMatch) {
    throw new Error("Could not parse login instructions from provisioned user dialog.");
  }
  return {
    username: usernameMatch[1].trim(),
    temporaryPassword: passwordMatch[1].trim(),
  };
}
