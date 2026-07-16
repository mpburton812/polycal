"use client";

import { AdminCollapsibleSection } from "@/components/admin/AdminCollapsibleSection";
import { CodeStatusPanel } from "@/components/layout/CodeStatusPanel";
import type { BuildInfo } from "@/lib/env";
import type { ChangelogEntry } from "@/lib/changelog/entries";

/**
 * Admin Code Status section — shared panel inside a collapsible (PC-254).
 */
export function AdminCodeStatusPanel({
  buildInfo,
  changelog,
  latestEntry,
}: {
  buildInfo: BuildInfo;
  changelog: ChangelogEntry[];
  latestEntry: ChangelogEntry | null;
}) {
  return (
    <AdminCollapsibleSection title="Code Status">
      <CodeStatusPanel
        buildInfo={buildInfo}
        changelog={changelog}
        latestEntry={latestEntry}
        logForceReload
        embedded
      />
    </AdminCollapsibleSection>
  );
}
