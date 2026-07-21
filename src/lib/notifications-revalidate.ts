import { revalidatePath } from "next/cache";

/**
 * Revalidates app-shell routes that render the inbox badge, instead of the
 * full root layout (PC-282). Badge props stream from `(app)/layout` into every
 * primary nav surface — feed / schedule / proposals.
 */
export function revalidateNotificationShellPaths(): void {
  revalidatePath("/feed");
  revalidatePath("/schedule");
  revalidatePath("/proposals");
}
